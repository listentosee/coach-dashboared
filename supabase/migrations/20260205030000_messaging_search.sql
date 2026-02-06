-- Messaging search helpers

CREATE OR REPLACE FUNCTION public.search_message_items(
  p_user_id uuid,
  p_query text,
  p_archived boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz,
  parent_message_id uuid,
  thread_root_id uuid,
  sender_name text,
  sender_email text,
  conversation_title text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    m.id,
    m.conversation_id,
    m.sender_id,
    m.body,
    m.created_at,
    m.parent_message_id,
    m.thread_root_id,
    p.first_name || ' ' || p.last_name AS sender_name,
    p.email AS sender_email,
    c.title AS conversation_title
  FROM public.messages m
  JOIN public.conversations c ON c.id = m.conversation_id
  JOIN public.profiles p ON p.id = m.sender_id
  JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
  LEFT JOIN public.message_user_state mus
    ON mus.message_id = m.id AND mus.user_id = p_user_id
  WHERE cm.user_id = p_user_id
    AND (
      (p_archived = false AND (mus.archived_at IS NULL OR mus.user_id IS NULL))
      OR (p_archived = true AND mus.archived_at IS NOT NULL)
    )
    AND (
      m.body ILIKE '%' || p_query || '%'
      OR c.title ILIKE '%' || p_query || '%'
      OR (p.first_name || ' ' || p.last_name) ILIKE '%' || p_query || '%'
      OR p.email ILIKE '%' || p_query || '%'
    )
  ORDER BY m.created_at DESC
  LIMIT 500;
$$;

CREATE OR REPLACE FUNCTION public.search_drafts_for_user(
  p_user_id uuid,
  p_query text
)
RETURNS TABLE (
  id uuid,
  mode text,
  body text,
  subject text,
  dm_recipient_id uuid,
  recipient_name text,
  recipient_email text,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    d.id,
    d.mode,
    d.body,
    d.subject,
    d.dm_recipient_id,
    COALESCE(p.first_name || ' ' || p.last_name, p.email) AS recipient_name,
    p.email AS recipient_email,
    d.updated_at
  FROM public.message_drafts d
  LEFT JOIN public.profiles p ON p.id = d.dm_recipient_id
  WHERE d.user_id = p_user_id
    AND (
      d.subject ILIKE '%' || p_query || '%'
      OR d.body ILIKE '%' || p_query || '%'
      OR COALESCE(p.first_name || ' ' || p.last_name, p.email) ILIKE '%' || p_query || '%'
      OR p.email ILIKE '%' || p_query || '%'
    )
  ORDER BY d.updated_at DESC
  LIMIT 200;
$$;

GRANT ALL ON FUNCTION public.search_message_items(uuid, text, boolean) TO anon;
GRANT ALL ON FUNCTION public.search_message_items(uuid, text, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.search_message_items(uuid, text, boolean) TO service_role;
GRANT ALL ON FUNCTION public.search_drafts_for_user(uuid, text) TO anon;
GRANT ALL ON FUNCTION public.search_drafts_for_user(uuid, text) TO authenticated;
GRANT ALL ON FUNCTION public.search_drafts_for_user(uuid, text) TO service_role;
