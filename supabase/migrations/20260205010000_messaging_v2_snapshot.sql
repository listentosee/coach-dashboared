-- Messaging v2 snapshot helpers (summaries + recent messages + thread summaries)

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
  last_sender_email text
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
    p.email as last_sender_email
  from base b
  left join counts c on c.id = b.id
  left join last_msg lm on lm.conversation_id = b.id
  left join public.profiles p on p.id = lm.last_sender_id;
$$;

CREATE OR REPLACE FUNCTION public.get_recent_messages_for_user(
  p_user_id uuid,
  p_limit_per_conversation integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz,
  parent_message_id uuid,
  sender_name text,
  sender_email text,
  flagged boolean,
  archived_at timestamptz,
  high_priority boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  with convs as (
    select c.id
    from public.conversations c
    join public.conversation_members cm on cm.conversation_id = c.id
    where cm.user_id = p_user_id
  )
  select
    m.id,
    m.conversation_id,
    m.sender_id,
    m.body,
    m.created_at,
    m.parent_message_id,
    p.first_name || ' ' || p.last_name as sender_name,
    p.email as sender_email,
    coalesce(m.flagged, false) as flagged,
    m.archived_at,
    m.high_priority
  from convs c
  join lateral (
    select m.*, mus.flagged, mus.archived_at
    from public.messages m
    left join public.message_user_state mus
      on mus.message_id = m.id and mus.user_id = p_user_id
    where m.conversation_id = c.id
      and (mus.archived_at is null or mus.user_id is null)
    order by m.created_at desc
    limit least(greatest(coalesce(p_limit_per_conversation, 50), 1), 200)
  ) m on true
  join public.profiles p on p.id = m.sender_id;
$$;

CREATE OR REPLACE FUNCTION public.list_threads_for_user(
  p_user_id uuid,
  p_limit integer DEFAULT 500
)
RETURNS TABLE (
  conversation_id uuid,
  root_id uuid,
  sender_id uuid,
  created_at timestamptz,
  snippet text,
  reply_count integer,
  last_reply_at timestamptz,
  unread_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  with memberships as (
    select cm.conversation_id
    from public.conversation_members cm
    where cm.user_id = p_user_id
  ),
  roots as (
    select m.id as root_id,
           m.conversation_id,
           m.sender_id,
           m.created_at,
           m.body,
           coalesce(m.thread_reply_count, 0) as reply_count,
           m.thread_last_reply_at
    from public.messages m
    join memberships ms on ms.conversation_id = m.conversation_id
    where m.parent_message_id is null
  ),
  unreads as (
    select rt.root_id,
           count(m.id)::int as unread_count
    from roots rt
    join public.messages m on (m.id = rt.root_id or m.thread_root_id = rt.root_id)
    left join public.message_read_receipts r on r.message_id = m.id and r.user_id = p_user_id
    where m.sender_id <> p_user_id and r.id is null
    group by rt.root_id
  )
  select
    rt.conversation_id,
    rt.root_id,
    rt.sender_id,
    rt.created_at,
    left(regexp_replace(rt.body, '\n+', ' ', 'g'), 160) as snippet,
    rt.reply_count,
    rt.thread_last_reply_at as last_reply_at,
    coalesce(uw.unread_count, 0) as unread_count
  from roots rt
  left join unreads uw on uw.root_id = rt.root_id
  order by coalesce(rt.thread_last_reply_at, rt.created_at) desc
  limit least(greatest(coalesce(p_limit, 500), 1), 2000);
$$;

GRANT ALL ON FUNCTION public.list_conversations_summary(uuid) TO anon;
GRANT ALL ON FUNCTION public.list_conversations_summary(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.list_conversations_summary(uuid) TO service_role;
GRANT ALL ON FUNCTION public.get_recent_messages_for_user(uuid, integer) TO anon;
GRANT ALL ON FUNCTION public.get_recent_messages_for_user(uuid, integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_recent_messages_for_user(uuid, integer) TO service_role;
GRANT ALL ON FUNCTION public.list_threads_for_user(uuid, integer) TO anon;
GRANT ALL ON FUNCTION public.list_threads_for_user(uuid, integer) TO authenticated;
GRANT ALL ON FUNCTION public.list_threads_for_user(uuid, integer) TO service_role;
