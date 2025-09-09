-- Switch unread computation to message-level receipts
begin;

-- Count total unread by receipts for a user
create or replace function public.count_unread_by_receipts(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(t.cnt), 0)::int from (
    select count(*) as cnt
    from public.conversation_members cm
    join public.messages m on m.conversation_id = cm.conversation_id
    left join public.message_read_receipts r on r.message_id = m.id and r.user_id = p_user_id
    where cm.user_id = p_user_id
      and m.sender_id <> p_user_id
      and r.id is null
    group by cm.conversation_id
  ) as t;
$$;

-- Enriched conversation list using receipts-based unread
create or replace function public.list_conversations_enriched(p_user_id uuid)
returns table (
  id uuid,
  type text,
  title text,
  created_by uuid,
  created_at timestamptz,
  unread_count integer,
  last_message_at timestamptz,
  display_title text
)
language sql
stable
security definer
set search_path = public
as $$
  with user_convos as (
    select c.id, c.type, c.title, c.created_by, c.created_at
    from public.conversations c
    join public.conversation_members cm on cm.conversation_id = c.id and cm.user_id = p_user_id
  ),
  last_msg as (
    select m.conversation_id, max(m.created_at) as last_message_at
    from public.messages m
    join user_convos uc on uc.id = m.conversation_id
    group by m.conversation_id
  ),
  unread as (
    select uc.id as conversation_id, count(m.id)::int as unread_count
    from user_convos uc
    join public.messages m on m.conversation_id = uc.id and m.sender_id <> p_user_id
    left join public.message_read_receipts r on r.message_id = m.id and r.user_id = p_user_id
    where r.id is null
    group by uc.id
  )
  select 
    uc.id,
    uc.type,
    uc.title,
    uc.created_by,
    uc.created_at,
    coalesce(u.unread_count, 0) as unread_count,
    lm.last_message_at,
    case
      when uc.type = 'announcement' then coalesce(nullif(trim(uc.title), ''), 'Announcement')
      when uc.type = 'dm' then coalesce(
        (
          select nullif(trim(p.first_name || ' ' || p.last_name), '')
          from public.conversation_members cm
          join public.profiles p on p.id = cm.user_id
          where cm.conversation_id = uc.id and cm.user_id <> p_user_id
          limit 1
        ),
        (
          select p.email
          from public.conversation_members cm
          join public.profiles p on p.id = cm.user_id
          where cm.conversation_id = uc.id and cm.user_id <> p_user_id
          limit 1
        ),
        'Direct Message'
      )
      when uc.type = 'group' then coalesce(
        nullif(trim(uc.title), ''),
        (
          select string_agg(coalesce(nullif(trim(p.first_name || ' ' || p.last_name), ''), p.email), ', ')
          from public.conversation_members cm
          join public.profiles p on p.id = cm.user_id
          where cm.conversation_id = uc.id and cm.user_id <> p_user_id
        ),
        'Group Conversation'
      )
      else uc.title
    end as display_title
  from user_convos uc
  left join last_msg lm on lm.conversation_id = uc.id
  left join unread u on u.conversation_id = uc.id
  order by coalesce(lm.last_message_at, uc.created_at) desc;
$$;

-- Update list_threads unread to receipts-based
create or replace function public.list_threads(p_conversation_id uuid, p_limit int default 200)
returns table (
  root_id bigint,
  sender_id uuid,
  created_at timestamptz,
  snippet text,
  reply_count integer,
  last_reply_at timestamptz,
  read_count integer,
  unread_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  with roots as (
    select m.id as root_id,
           m.sender_id,
           m.created_at,
           m.body,
           coalesce(m.thread_reply_count, 0) as reply_count,
           m.thread_last_reply_at
    from public.messages m
    where m.conversation_id = p_conversation_id
      and m.parent_message_id is null
  ),
  reads as (
    select r.message_id, count(*)::int as read_count
    from public.message_read_receipts r
    join roots rt on rt.root_id = r.message_id
    group by r.message_id
  ),
  unreads as (
    select rt.root_id,
           count(m.id)::int as unread_count
    from roots rt
    join public.messages m on (m.id = rt.root_id or m.thread_root_id = rt.root_id)
    left join public.message_read_receipts r on r.message_id = m.id and r.user_id = auth.uid()
    where m.sender_id <> auth.uid() and r.id is null
    group by rt.root_id
  )
  select 
    rt.root_id,
    rt.sender_id,
    rt.created_at,
    left(regexp_replace(rt.body, '\n+', ' ', 'g'), 160) as snippet,
    rt.reply_count,
    rt.thread_last_reply_at as last_reply_at,
    coalesce(rd.read_count, 0) as read_count,
    coalesce(uw.unread_count, 0) as unread_count
  from roots rt
  left join reads rd on rd.message_id = rt.root_id
  left join unreads uw on uw.root_id = rt.root_id
  order by coalesce(rt.thread_last_reply_at, rt.created_at) desc
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
$$;

commit;

