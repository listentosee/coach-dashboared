-- Fix archive functions to delete read receipts before deleting messages

DROP FUNCTION IF EXISTS public.archive_conversation_v2(UUID);
DROP FUNCTION IF EXISTS public.archive_message(UUID);

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

  -- Delete read receipts first (FK constraint)
  DELETE FROM public.message_read_receipts
  WHERE message_id IN (
    SELECT id FROM public.messages WHERE conversation_id = p_conversation_id
  );

  -- Delete messages
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

  -- Delete read receipts first (FK constraint)
  DELETE FROM public.message_read_receipts WHERE message_id = p_message_id;

  -- Delete the message
  DELETE FROM public.messages WHERE id = p_message_id;

  -- Also remove any pinned items for this message
  DELETE FROM public.pinned_items
  WHERE message_id = p_message_id AND user_id = v_user_id;
END;
$$;
