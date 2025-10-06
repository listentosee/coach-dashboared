-- Create archived_messages table for flexible archiving

-- Drop old archive approach (archived_at column)
ALTER TABLE public.conversation_members DROP COLUMN IF EXISTS archived_at;

-- Create new archive table
CREATE TABLE IF NOT EXISTS public.archived_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archive_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_archived_messages_user_archived_at ON public.archived_messages(user_id, archived_at DESC);

-- RLS
ALTER TABLE public.archived_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own archived items"
  ON public.archived_messages
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own archived items"
  ON public.archived_messages
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own archived items"
  ON public.archived_messages
  FOR DELETE
  USING (auth.uid() = user_id);

-- Archive a conversation (conversation + all messages)
CREATE OR REPLACE FUNCTION public.archive_conversation_v2(
  p_conversation_id UUID
)
RETURNS VOID
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_conversation JSONB;
  v_messages JSONB;
  v_archive_data JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get conversation data
  SELECT to_jsonb(c.*) INTO v_conversation
  FROM public.conversations c
  WHERE c.id = p_conversation_id;

  IF v_conversation IS NULL THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  -- Get all messages in conversation
  SELECT jsonb_agg(to_jsonb(m.*) ORDER BY m.created_at)
  INTO v_messages
  FROM public.messages m
  WHERE m.conversation_id = p_conversation_id;

  -- Build archive payload
  v_archive_data := jsonb_build_object(
    'type', 'conversation',
    'conversation', v_conversation,
    'messages', COALESCE(v_messages, '[]'::jsonb)
  );

  -- Insert archive record
  INSERT INTO public.archived_messages (user_id, archive_data)
  VALUES (v_user_id, v_archive_data);

  -- Delete messages first (due to FK constraints)
  DELETE FROM public.messages WHERE conversation_id = p_conversation_id;

  -- Delete conversation
  DELETE FROM public.conversations WHERE id = p_conversation_id;

  -- Also remove any pinned items for this conversation
  DELETE FROM public.pinned_items
  WHERE conversation_id = p_conversation_id AND user_id = v_user_id;
END;
$$;

-- Archive a single message
CREATE OR REPLACE FUNCTION public.archive_message(
  p_message_id UUID
)
RETURNS VOID
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_message JSONB;
  v_conversation_id UUID;
  v_archive_data JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get message data
  SELECT to_jsonb(m.*), m.conversation_id
  INTO v_message, v_conversation_id
  FROM public.messages m
  WHERE m.id = p_message_id;

  IF v_message IS NULL THEN
    RAISE EXCEPTION 'Message not found';
  END IF;

  -- Verify user is member of conversation
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_members cm
    WHERE cm.conversation_id = v_conversation_id AND cm.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this conversation';
  END IF;

  -- Build archive payload
  v_archive_data := jsonb_build_object(
    'type', 'message',
    'message', v_message
  );

  -- Insert archive record
  INSERT INTO public.archived_messages (user_id, archive_data)
  VALUES (v_user_id, v_archive_data);

  -- Delete the message
  DELETE FROM public.messages WHERE id = p_message_id;

  -- Also remove any pinned items for this message
  DELETE FROM public.pinned_items
  WHERE message_id = p_message_id AND user_id = v_user_id;
END;
$$;

-- Restore from archive
CREATE OR REPLACE FUNCTION public.restore_archived_item(
  p_archive_id UUID
)
RETURNS VOID
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_archive_data JSONB;
  v_type TEXT;
  v_conversation JSONB;
  v_messages JSONB;
  v_message JSONB;
  v_msg JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get archive data
  SELECT archive_data INTO v_archive_data
  FROM public.archived_messages
  WHERE id = p_archive_id AND user_id = v_user_id;

  IF v_archive_data IS NULL THEN
    RAISE EXCEPTION 'Archive not found';
  END IF;

  v_type := v_archive_data->>'type';

  IF v_type = 'conversation' THEN
    -- Restore conversation
    v_conversation := v_archive_data->'conversation';
    INSERT INTO public.conversations
    SELECT * FROM jsonb_populate_record(NULL::public.conversations, v_conversation);

    -- Restore messages
    v_messages := v_archive_data->'messages';
    IF v_messages IS NOT NULL AND jsonb_array_length(v_messages) > 0 THEN
      FOR v_msg IN SELECT * FROM jsonb_array_elements(v_messages)
      LOOP
        INSERT INTO public.messages
        SELECT * FROM jsonb_populate_record(NULL::public.messages, v_msg);
      END LOOP;
    END IF;

  ELSIF v_type = 'message' THEN
    -- Restore single message
    v_message := v_archive_data->'message';
    INSERT INTO public.messages
    SELECT * FROM jsonb_populate_record(NULL::public.messages, v_message);

  ELSE
    RAISE EXCEPTION 'Unknown archive type: %', v_type;
  END IF;

  -- Delete archive record
  DELETE FROM public.archived_messages WHERE id = p_archive_id;
END;
$$;

-- Get archived items for user
CREATE OR REPLACE FUNCTION public.get_archived_items(
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  archived_at TIMESTAMPTZ,
  archive_type TEXT,
  archive_data JSONB
)
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    am.id,
    am.archived_at,
    (am.archive_data->>'type')::TEXT AS archive_type,
    am.archive_data
  FROM public.archived_messages am
  WHERE am.user_id = v_user_id
  ORDER BY am.archived_at DESC;
END;
$$;

-- Drop old archive functions
DROP FUNCTION IF EXISTS public.archive_conversation(UUID);
DROP FUNCTION IF EXISTS public.unarchive_conversation(UUID);
