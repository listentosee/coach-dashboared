-- Update get_conversation_messages to include flagged column
DROP FUNCTION IF EXISTS public.get_conversation_messages(UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.get_conversation_messages(
  p_conversation_id UUID,
  p_limit INTEGER DEFAULT 500
)
RETURNS TABLE(
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
    v.id,
    v.conversation_id,
    v.sender_id,
    v.body,
    v.created_at,
    m.parent_message_id,
    v.first_name || ' ' || v.last_name AS sender_name,
    v.email AS sender_email,
    m.flagged
  FROM public.v_messages_with_sender v
  JOIN public.messages m ON m.id = v.id
  WHERE v.conversation_id = p_conversation_id
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = p_conversation_id AND cm.user_id = auth.uid()
    )
  ORDER BY v.created_at ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
$$;

GRANT EXECUTE ON FUNCTION public.get_conversation_messages(UUID, INTEGER) TO authenticated;

-- Update get_thread_messages to include flagged column
DROP FUNCTION IF EXISTS public.get_thread_messages(UUID);

CREATE OR REPLACE FUNCTION public.get_thread_messages(
  p_thread_root_id UUID
)
RETURNS TABLE(
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
    v.id,
    v.sender_id,
    v.body,
    v.created_at,
    m.parent_message_id,
    v.first_name || ' ' || v.last_name AS sender_name,
    v.email AS sender_email,
    m.flagged
  FROM public.v_messages_with_sender v
  JOIN public.messages m ON m.id = v.id
  WHERE (m.id = p_thread_root_id OR m.thread_root_id = p_thread_root_id)
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = v.conversation_id AND cm.user_id = auth.uid()
    )
  ORDER BY v.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_thread_messages(UUID) TO authenticated;
