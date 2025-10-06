-- FERPA Compliant Message State Implementation
-- Creates per-user message state isolation for flags and archives

-- Remove conversation-level archiving - only message-level archiving allowed
ALTER TABLE public.conversation_members DROP COLUMN IF EXISTS archived_at;

-- Remove old flagged column from messages table (replaced by per-user state)
ALTER TABLE public.messages DROP COLUMN IF EXISTS flagged;

-- Step 1.1: Create message_user_state table for FERPA compliance
-- This table stores private user state (flags, archives) per message
CREATE TABLE IF NOT EXISTS public.message_user_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  flagged BOOLEAN NOT NULL DEFAULT false,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, message_id)
);

-- Performance indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_message_user_state_user_message ON public.message_user_state(user_id, message_id);
CREATE INDEX IF NOT EXISTS idx_message_user_state_user_flagged ON public.message_user_state(user_id) WHERE flagged = true;
CREATE INDEX IF NOT EXISTS idx_message_user_state_user_archived ON public.message_user_state(user_id) WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_message_user_state_message_flagged ON public.message_user_state(message_id) WHERE flagged = true;

-- Drop existing objects if they exist (for migration re-runs)
DROP TRIGGER IF EXISTS update_message_user_state_updated_at ON public.message_user_state;
DROP FUNCTION IF EXISTS update_message_user_state_updated_at();

-- Drop existing functions that will be redefined
DROP FUNCTION IF EXISTS public.get_conversation_messages(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.get_thread_messages(UUID);
DROP FUNCTION IF EXISTS public.get_message_user_state(UUID);
DROP FUNCTION IF EXISTS public.toggle_message_flag(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.archive_message_user(UUID);
DROP FUNCTION IF EXISTS public.unarchive_message_user(UUID);
DROP FUNCTION IF EXISTS public.list_conversations_with_user_state(UUID);
DROP FUNCTION IF EXISTS public.get_conversation_messages_with_state(UUID, UUID);

-- Drop existing policies if they exist (for migration re-runs)
DROP POLICY IF EXISTS "Users can view their own message state" ON public.message_user_state;
DROP POLICY IF EXISTS "Users can insert their own message state" ON public.message_user_state;
DROP POLICY IF EXISTS "Users can update their own message state" ON public.message_user_state;
DROP POLICY IF EXISTS "Users can delete their own message state" ON public.message_user_state;

-- Enable RLS for FERPA compliance
ALTER TABLE public.message_user_state ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only see/modify their own state
CREATE POLICY "Users can view their own message state"
  ON public.message_user_state
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own message state"
  ON public.message_user_state
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own message state"
  ON public.message_user_state
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own message state"
  ON public.message_user_state
  FOR DELETE
  USING (auth.uid() = user_id);

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_message_user_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_message_user_state_updated_at
    BEFORE UPDATE ON public.message_user_state
    FOR EACH ROW EXECUTE FUNCTION update_message_user_state_updated_at();

-- Update get_conversation_messages function to use per-user state for FERPA compliance
CREATE OR REPLACE FUNCTION public.get_conversation_messages(p_conversation_id UUID, p_limit INTEGER DEFAULT 500)
RETURNS TABLE (
  id UUID,
  conversation_id UUID,
  sender_id UUID,
  body TEXT,
  created_at TIMESTAMPTZ,
  parent_message_id UUID,
  sender_name TEXT,
  sender_email TEXT,
  flagged BOOLEAN
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.conversation_id,
    m.sender_id,
    m.body,
    m.created_at,
    m.parent_message_id,
    p.first_name || ' ' || p.last_name AS sender_name,
    p.email AS sender_email,
    COALESCE(mus.flagged, false) as flagged
  FROM public.messages m
  JOIN public.profiles p ON p.id = m.sender_id
  LEFT JOIN public.message_user_state mus ON (
    mus.message_id = m.id AND mus.user_id = auth.uid()
  )
  WHERE m.conversation_id = p_conversation_id
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = p_conversation_id AND cm.user_id = auth.uid()
    )
  ORDER BY m.created_at DESC
  LIMIT p_limit;
$$;

-- Update get_thread_messages function to use per-user state for FERPA compliance
CREATE OR REPLACE FUNCTION public.get_thread_messages(p_thread_root_id UUID)
RETURNS TABLE (
  id UUID,
  sender_id UUID,
  body TEXT,
  created_at TIMESTAMPTZ,
  parent_message_id UUID,
  sender_name TEXT,
  sender_email TEXT,
  flagged BOOLEAN
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.sender_id,
    m.body,
    m.created_at,
    m.parent_message_id,
    p.first_name || ' ' || p.last_name AS sender_name,
    p.email AS sender_email,
    COALESCE(mus.flagged, false) as flagged
  FROM public.messages m
  JOIN public.profiles p ON p.id = m.sender_id
  LEFT JOIN public.message_user_state mus ON (
    mus.message_id = m.id AND mus.user_id = auth.uid()
  )
  WHERE (m.id = p_thread_root_id OR m.thread_root_id = p_thread_root_id)
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = (
        SELECT conversation_id FROM public.messages WHERE id = p_thread_root_id
      ) AND cm.user_id = auth.uid()
    )
  ORDER BY m.created_at ASC;
$$;

-- Helper function: Get message state for current user
CREATE OR REPLACE FUNCTION public.get_message_user_state(p_message_id UUID)
RETURNS TABLE (
  flagged BOOLEAN,
  archived_at TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(mus.flagged, false) as flagged,
    mus.archived_at
  FROM public.message_user_state mus
  WHERE mus.message_id = p_message_id AND mus.user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_message_user_state(UUID) TO authenticated;

-- Helper function: Toggle message flag for current user
CREATE OR REPLACE FUNCTION public.toggle_message_flag(p_message_id UUID, p_flagged BOOLEAN)
RETURNS VOID
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify user has access to the message
  IF NOT EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
    WHERE m.id = p_message_id AND cm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: User is not a member of this conversation';
  END IF;

  -- Upsert the flag state
  INSERT INTO public.message_user_state (user_id, message_id, flagged)
  VALUES (auth.uid(), p_message_id, p_flagged)
  ON CONFLICT (user_id, message_id)
  DO UPDATE SET flagged = p_flagged, updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_message_flag(UUID, BOOLEAN) TO authenticated;

-- Helper function: Archive all messages in a conversation for current user
CREATE OR REPLACE FUNCTION public.archive_all_messages_in_conversation(p_conversation_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS VOID
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify user has access to the conversation
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_members cm
    WHERE cm.conversation_id = p_conversation_id AND cm.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Access denied: User is not a member of this conversation';
  END IF;

  -- Archive all messages in the conversation for this user
  INSERT INTO public.message_user_state (user_id, message_id, archived_at)
  SELECT p_user_id, m.id, NOW()
  FROM public.messages m
  WHERE m.conversation_id = p_conversation_id
  ON CONFLICT (user_id, message_id)
  DO UPDATE SET archived_at = NOW(), updated_at = NOW();
END;
$$;

-- Helper function: Archive message for current user (soft archive)
CREATE OR REPLACE FUNCTION public.archive_message_user(p_message_id UUID)
RETURNS VOID
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify user has access to the message
  IF NOT EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
    WHERE m.id = p_message_id AND cm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: User is not a member of this conversation';
  END IF;

  -- Archive the message for this user only
  INSERT INTO public.message_user_state (user_id, message_id, archived_at)
  VALUES (auth.uid(), p_message_id, NOW())
  ON CONFLICT (user_id, message_id)
  DO UPDATE SET archived_at = NOW(), updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_message_user(UUID) TO authenticated;

-- Helper function: Unarchive message for current user
CREATE OR REPLACE FUNCTION public.unarchive_message_user(p_message_id UUID)
RETURNS VOID
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify user has access to the message
  IF NOT EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
    WHERE m.id = p_message_id AND cm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: User is not a member of this conversation';
  END IF;

  -- Unarchive the message for this user only
  UPDATE public.message_user_state
  SET archived_at = NULL, updated_at = NOW()
  WHERE user_id = auth.uid() AND message_id = p_message_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unarchive_message_user(UUID) TO authenticated;

-- Updated conversation query functions to include per-user state
-- Enhanced version of list_conversations_with_unread that includes user state
CREATE OR REPLACE FUNCTION public.list_conversations_with_user_state(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  type TEXT,
  title TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ,
  unread_count INTEGER,
  last_message_at TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT c.id, c.type, c.title, c.created_by, c.created_at,
           cm.last_read_at
    FROM public.conversations c
    JOIN public.conversation_members cm ON cm.conversation_id = c.id
    WHERE cm.user_id = p_user_id
  ),
  counts AS (
    SELECT b.id, count(m.id)::int as unread_count,
           max(m.created_at) as last_message_at
    FROM base b
    LEFT JOIN public.messages m
      ON m.conversation_id = b.id
     AND m.created_at > b.last_read_at
     AND m.sender_id <> p_user_id
    GROUP BY b.id
  )
  SELECT b.id, b.type, b.title, b.created_by, b.created_at,
         COALESCE(c.unread_count, 0) as unread_count,
         c.last_message_at
  FROM base b
  LEFT JOIN counts c ON c.id = b.id
  ORDER BY COALESCE(c.last_message_at, b.created_at) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_conversations_with_user_state(UUID) TO authenticated;

-- Enhanced message query function with per-user state
-- Returns data in the format expected by the frontend while using per-user state
CREATE OR REPLACE FUNCTION public.get_conversation_messages_with_state(
  p_conversation_id UUID,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  conversation_id UUID,
  sender_id UUID,
  body TEXT,
  created_at TIMESTAMPTZ,
  parent_message_id UUID,
  sender_name TEXT,
  sender_email TEXT,
  read_at TIMESTAMPTZ,
  flagged BOOLEAN,
  archived_at TIMESTAMPTZ,
  is_sender BOOLEAN
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.conversation_id,
    m.sender_id,
    m.body,
    m.created_at,
    m.parent_message_id,
    p.first_name || ' ' || p.last_name AS sender_name,
    p.email AS sender_email,
    NULL::TIMESTAMPTZ as read_at, -- Will be populated by frontend from read receipts
    COALESCE(mus.flagged, false) as flagged,
    mus.archived_at,
    m.sender_id = COALESCE(p_user_id, auth.uid()) as is_sender
  FROM public.messages m
  JOIN public.profiles p ON p.id = m.sender_id
  LEFT JOIN public.message_user_state mus ON (
    mus.message_id = m.id AND mus.user_id = COALESCE(p_user_id, auth.uid())
  )
  WHERE m.conversation_id = p_conversation_id
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = m.conversation_id
        AND cm.user_id = COALESCE(p_user_id, auth.uid())
    )
    AND (mus.archived_at IS NULL OR mus.user_id IS NULL)  -- Message not archived by user
  ORDER BY m.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_conversation_messages_with_state(UUID, UUID) TO authenticated;

-- Comments for documentation
COMMENT ON TABLE public.message_user_state IS 'FERPA-compliant per-user message state isolation - flags and archives are private to each user';
COMMENT ON FUNCTION public.get_message_user_state(UUID) IS 'Get current user''s state for a specific message (flagged, archived)';
COMMENT ON FUNCTION public.toggle_message_flag(UUID, BOOLEAN) IS 'Toggle flag state for current user on a message';
COMMENT ON FUNCTION public.archive_message_user(UUID) IS 'Soft-archive a message for current user (hides but doesn''t delete)';
COMMENT ON FUNCTION public.unarchive_message_user(UUID) IS 'Unarchive a message for current user (restore visibility)';
COMMENT ON FUNCTION public.list_conversations_with_user_state(UUID) IS 'List conversations with per-user state (archives, unread counts)';
COMMENT ON FUNCTION public.get_conversation_messages_with_state(UUID, UUID) IS 'Get conversation messages with per-user state filtering';
