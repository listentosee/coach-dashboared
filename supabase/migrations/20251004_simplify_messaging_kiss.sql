-- KISS Messaging Simplification
-- Date: October 4, 2025
-- Description: Remove threading complexity - conversations ARE the threads
-- Each conversation contains all its messages, ordered chronologically
-- No need for thread_root_id, list_threads, or complex threading logic

BEGIN;

-- ============================================================================
-- 1. Simplified: Get ALL messages in a conversation
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_conversation_messages(UUID, INT);

CREATE OR REPLACE FUNCTION public.get_conversation_messages(
  p_conversation_id UUID,
  p_limit INT DEFAULT 500
)
RETURNS TABLE (
  id BIGINT,
  conversation_id UUID,
  sender_id UUID,
  body TEXT,
  created_at TIMESTAMPTZ,
  parent_message_id BIGINT,
  sender_name TEXT,
  sender_email TEXT
)
LANGUAGE sql
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
    p.email AS sender_email
  FROM public.messages m
  JOIN public.profiles p ON p.id = m.sender_id
  WHERE m.conversation_id = p_conversation_id
    -- Must be a member of the conversation
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = p_conversation_id
        AND cm.user_id = auth.uid()
    )
    -- Visibility rules (for legacy private_to support)
    AND (
      COALESCE((m.metadata ->> 'private_to')::UUID, '00000000-0000-0000-0000-000000000000'::UUID) = '00000000-0000-0000-0000-000000000000'::UUID
      OR (m.metadata ->> 'private_to')::UUID = auth.uid()
      OR m.sender_id = auth.uid()
      OR public.is_admin(auth.uid())
    )
  ORDER BY m.created_at ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 500), 1), 1000);
$$;

GRANT EXECUTE ON FUNCTION public.get_conversation_messages(UUID, INT) TO authenticated;

-- ============================================================================
-- 2. Simplified: Get conversation summary for inbox list
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_conversation_summary(UUID);

CREATE OR REPLACE FUNCTION public.get_conversation_summary(
  p_conversation_id UUID
)
RETURNS TABLE (
  last_message_body TEXT,
  last_message_at TIMESTAMPTZ,
  last_sender_name TEXT,
  total_messages INT,
  unread_count INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH last_msg AS (
    SELECT
      m.body,
      m.created_at,
      p.first_name || ' ' || p.last_name AS sender_name
    FROM public.messages m
    JOIN public.profiles p ON p.id = m.sender_id
    WHERE m.conversation_id = p_conversation_id
      AND EXISTS (
        SELECT 1 FROM public.conversation_members cm
        WHERE cm.conversation_id = p_conversation_id
          AND cm.user_id = auth.uid()
      )
      AND (
        COALESCE((m.metadata ->> 'private_to')::UUID, '00000000-0000-0000-0000-000000000000'::UUID) = '00000000-0000-0000-0000-000000000000'::UUID
        OR (m.metadata ->> 'private_to')::UUID = auth.uid()
        OR m.sender_id = auth.uid()
        OR public.is_admin(auth.uid())
      )
    ORDER BY m.created_at DESC
    LIMIT 1
  ),
  totals AS (
    SELECT COUNT(*)::INT AS total_messages
    FROM public.messages m
    WHERE m.conversation_id = p_conversation_id
      AND EXISTS (
        SELECT 1 FROM public.conversation_members cm
        WHERE cm.conversation_id = p_conversation_id
          AND cm.user_id = auth.uid()
      )
      AND (
        COALESCE((m.metadata ->> 'private_to')::UUID, '00000000-0000-0000-0000-000000000000'::UUID) = '00000000-0000-0000-0000-000000000000'::UUID
        OR (m.metadata ->> 'private_to')::UUID = auth.uid()
        OR m.sender_id = auth.uid()
        OR public.is_admin(auth.uid())
      )
  ),
  unreads AS (
    SELECT COUNT(*)::INT AS unread_count
    FROM public.messages m
    LEFT JOIN public.message_read_receipts r ON r.message_id = m.id AND r.user_id = auth.uid()
    WHERE m.conversation_id = p_conversation_id
      AND m.sender_id <> auth.uid()
      AND r.id IS NULL
      AND EXISTS (
        SELECT 1 FROM public.conversation_members cm
        WHERE cm.conversation_id = p_conversation_id
          AND cm.user_id = auth.uid()
      )
      AND (
        COALESCE((m.metadata ->> 'private_to')::UUID, '00000000-0000-0000-0000-000000000000'::UUID) = '00000000-0000-0000-0000-000000000000'::UUID
        OR (m.metadata ->> 'private_to')::UUID = auth.uid()
        OR m.sender_id = auth.uid()
        OR public.is_admin(auth.uid())
      )
  )
  SELECT
    lm.body AS last_message_body,
    lm.created_at AS last_message_at,
    lm.sender_name AS last_sender_name,
    t.total_messages,
    u.unread_count
  FROM last_msg lm
  CROSS JOIN totals t
  CROSS JOIN unreads u;
$$;

GRANT EXECUTE ON FUNCTION public.get_conversation_summary(UUID) TO authenticated;

-- ============================================================================
-- 3. Keep existing list_conversations_enriched (already simple enough)
-- ============================================================================

-- No changes needed - this function already returns all conversations
-- with unread counts, which is all we need for the inbox list

COMMIT;
