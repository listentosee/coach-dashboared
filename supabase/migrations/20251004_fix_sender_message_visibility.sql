-- Fix: Ensure sender can see their own messages in all contexts
-- Date: October 4, 2025
-- Description: Update list_threads to ensure it doesn't filter out sender's own root messages

BEGIN;

-- The issue might be that list_threads is filtering based on membership
-- but not accounting for messages sent by the user themselves
-- Let's verify the current list_threads includes all messages properly

-- Check if there's any filtering preventing senders from seeing their own thread roots
CREATE OR REPLACE FUNCTION public.list_threads(
  p_conversation_id UUID,
  p_limit INT DEFAULT 200
)
RETURNS TABLE (
  root_id BIGINT,
  sender_id UUID,
  created_at TIMESTAMPTZ,
  snippet TEXT,
  reply_count INTEGER,
  last_reply_at TIMESTAMPTZ,
  read_count INTEGER,
  unread_count INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH roots AS (
    SELECT
      m.id AS root_id,
      m.sender_id,
      m.created_at,
      m.body,
      COALESCE(m.thread_reply_count, 0) AS reply_count,
      m.thread_last_reply_at
    FROM public.messages m
    WHERE m.conversation_id = p_conversation_id
      AND m.parent_message_id IS NULL
      -- Ensure sender can see their own root messages
      AND (
        EXISTS (
          SELECT 1 FROM public.conversation_members cm
          WHERE cm.conversation_id = p_conversation_id
            AND cm.user_id = auth.uid()
        )
      )
      -- Include messages visible based on private_to rules
      AND (
        COALESCE((m.metadata ->> 'private_to')::UUID, '00000000-0000-0000-0000-000000000000'::UUID) = '00000000-0000-0000-0000-000000000000'::UUID
        OR (m.metadata ->> 'private_to')::UUID = auth.uid()
        OR m.sender_id = auth.uid()
        OR public.is_admin(auth.uid())
      )
  ),
  reads AS (
    SELECT r.message_id, COUNT(*)::INT AS read_count
    FROM public.message_read_receipts r
    JOIN roots rt ON rt.root_id = r.message_id
    GROUP BY r.message_id
  ),
  unreads AS (
    SELECT m.thread_root_id AS root_id, COUNT(*)::INT AS unread_count
    FROM public.messages m
    LEFT JOIN public.message_read_receipts r ON r.message_id = m.id AND r.user_id = auth.uid()
    WHERE m.conversation_id = p_conversation_id
      AND m.sender_id <> auth.uid()
      AND r.id IS NULL
      AND EXISTS (SELECT 1 FROM roots rt WHERE rt.root_id = COALESCE(m.thread_root_id, m.id))
    GROUP BY m.thread_root_id
  )
  SELECT
    rt.root_id,
    rt.sender_id,
    rt.created_at,
    LEFT(REGEXP_REPLACE(rt.body, E'\\n+', ' ', 'g'), 160) AS snippet,
    rt.reply_count,
    rt.last_reply_at,
    COALESCE(rd.read_count, 0) AS read_count,
    COALESCE(ur.unread_count, 0) AS unread_count
  FROM roots rt
  LEFT JOIN reads rd ON rd.message_id = rt.root_id
  LEFT JOIN unreads ur ON ur.root_id = rt.root_id
  ORDER BY COALESCE(rt.last_reply_at, rt.created_at) DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
$$;

GRANT EXECUTE ON FUNCTION public.list_threads(UUID, INT) TO authenticated;

COMMIT;
