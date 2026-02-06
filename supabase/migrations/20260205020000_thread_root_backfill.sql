-- Backfill thread_root_id for legacy replies and ensure thread fetch includes direct children

UPDATE public.messages m
SET thread_root_id = COALESCE(parent.thread_root_id, parent.id)
FROM public.messages parent
WHERE m.parent_message_id IS NOT NULL
  AND m.thread_root_id IS NULL
  AND parent.id = m.parent_message_id;

CREATE OR REPLACE FUNCTION public.get_thread_messages(p_thread_root_id uuid)
RETURNS TABLE(
  id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz,
  parent_message_id uuid,
  sender_name text,
  sender_email text,
  flagged boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
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
  WHERE (m.id = p_thread_root_id OR m.thread_root_id = p_thread_root_id OR m.parent_message_id = p_thread_root_id)
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = (
        SELECT conversation_id FROM public.messages WHERE id = p_thread_root_id
      ) AND cm.user_id = auth.uid()
    )
  ORDER BY m.created_at ASC;
$$;

GRANT ALL ON FUNCTION public.get_thread_messages(uuid) TO anon;
GRANT ALL ON FUNCTION public.get_thread_messages(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_thread_messages(uuid) TO service_role;
