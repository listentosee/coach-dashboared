-- 1. Update archive_all_messages_in_conversation to also mark conversation as read
--    (sets last_read_at on conversation_members so unread count goes to 0)
-- 2. Add all_archived to list_conversations_summary so V2 path can filter archived conversations
--    Same derivation as list_conversations_enriched: all_archived = (total_messages > 0 AND all have archived_at)

CREATE OR REPLACE FUNCTION public.archive_all_messages_in_conversation(
  p_conversation_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
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

  -- Mark conversation as read so archived conversations show 0 unread
  UPDATE public.conversation_members
  SET last_read_at = NOW()
  WHERE conversation_id = p_conversation_id AND user_id = p_user_id;
END;
$$;

DROP FUNCTION IF EXISTS public.list_conversations_summary(uuid);

CREATE OR REPLACE FUNCTION public.list_conversations_summary(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  type text,
  title text,
  created_by uuid,
  created_at timestamptz,
  unread_count integer,
  last_message_at timestamptz,
  display_title text,
  last_message_body text,
  last_sender_name text,
  last_sender_email text,
  all_archived boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  with base as (
    select c.id, c.type, c.title, c.created_by, c.created_at,
           cm.last_read_at
    from public.conversations c
    join public.conversation_members cm on cm.conversation_id = c.id
    where cm.user_id = p_user_id
  ),
  counts as (
    select b.id,
           count(m.id)::int as unread_count,
           max(m.created_at) as last_message_at
    from base b
    left join public.messages m on m.conversation_id = b.id
      and m.created_at > b.last_read_at
      and m.sender_id <> p_user_id
    group by b.id
  ),
  last_msg as (
    select b.id as conversation_id,
           lm.id as message_id,
           lm.body as last_message_body,
           lm.sender_id as last_sender_id,
           lm.created_at as last_message_at
    from base b
    left join lateral (
      select m.id, m.body, m.sender_id, m.created_at
      from public.messages m
      where m.conversation_id = b.id
      order by m.created_at desc
      limit 1
    ) lm on true
  ),
  archive_state as (
    select b.id,
           count(m.id) as total_messages,
           count(mus.archived_at) as archived_messages
    from base b
    left join public.messages m on m.conversation_id = b.id
    left join public.message_user_state mus
      on mus.message_id = m.id and mus.user_id = p_user_id
    group by b.id
  )
  select
    b.id,
    b.type,
    b.title,
    b.created_by,
    b.created_at,
    coalesce(c.unread_count, 0) as unread_count,
    coalesce(lm.last_message_at, c.last_message_at) as last_message_at,
    case
      when b.type = 'announcement' then coalesce(nullif(trim(b.title), ''), 'Announcement')
      when b.type = 'dm' then coalesce(
        (
          select nullif(trim(p.first_name || ' ' || p.last_name), '')
          from public.conversation_members cm
          join public.profiles p on p.id = cm.user_id
          where cm.conversation_id = b.id and cm.user_id <> p_user_id
          limit 1
        ),
        (
          select p.email
          from public.conversation_members cm
          join public.profiles p on p.id = cm.user_id
          where cm.conversation_id = b.id and cm.user_id <> p_user_id
          limit 1
        ),
        'Direct Message'
      )
      when b.type = 'group' then coalesce(
        nullif(trim(b.title), ''),
        (
          select string_agg(
            coalesce(nullif(trim(p.first_name || ' ' || p.last_name), ''), p.email),
            ', '
          )
          from public.conversation_members cm
          join public.profiles p on p.id = cm.user_id
          where cm.conversation_id = b.id and cm.user_id <> p_user_id
        ),
        'Group Conversation'
      )
      else coalesce(nullif(trim(b.title), ''), 'Conversation')
    end as display_title,
    lm.last_message_body,
    (p.first_name || ' ' || p.last_name) as last_sender_name,
    p.email as last_sender_email,
    (a.total_messages > 0 and a.total_messages = a.archived_messages) as all_archived
  from base b
  left join counts c on c.id = b.id
  left join last_msg lm on lm.conversation_id = b.id
  left join public.profiles p on p.id = lm.last_sender_id
  left join archive_state a on a.id = b.id;
$$;
