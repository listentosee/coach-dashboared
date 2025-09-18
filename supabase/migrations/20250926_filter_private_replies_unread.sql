-- Ensure unread counters ignore announcement private replies (metadata.private_to).
begin;

create or replace function public.count_unread_messages(p_user_id uuid)
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
    where cm.user_id = p_user_id
      and m.created_at > cm.last_read_at
      and m.sender_id <> p_user_id
      and coalesce(
            nullif(m.metadata ->> 'private_to', '')::uuid,
            '00000000-0000-0000-0000-000000000000'::uuid
          ) in ('00000000-0000-0000-0000-000000000000'::uuid, p_user_id)
    group by cm.conversation_id
  ) as t;
$$;

create or replace function public.list_conversations_with_unread(p_user_id uuid)
returns table (
  id uuid,
  type text,
  title text,
  created_by uuid,
  created_at timestamptz,
  unread_count integer,
  last_message_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
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
    left join public.messages m
      on m.conversation_id = b.id
     and m.created_at > b.last_read_at
     and m.sender_id <> p_user_id
     and coalesce(
           nullif(m.metadata ->> 'private_to', '')::uuid,
           '00000000-0000-0000-0000-000000000000'::uuid
         ) in ('00000000-0000-0000-0000-000000000000'::uuid, p_user_id)
    group by b.id
  )
  select b.id, b.type, b.title, b.created_by, b.created_at,
         coalesce(c.unread_count, 0) as unread_count,
         c.last_message_at
  from base b
  left join counts c on c.id = b.id
  order by coalesce(c.last_message_at, b.created_at) desc;
$$;

create or replace function public.get_unread_counts(p_user_id uuid default auth.uid())
returns table (
  conversation_id uuid,
  unread_count integer,
  last_message_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with user_conversations as (
    select cm.conversation_id, cm.last_read_at
    from public.conversation_members cm
    where cm.user_id = p_user_id
  ),
  message_counts as (
    select m.conversation_id,
           count(*)::int as unread_count,
           max(m.created_at) as last_message_at
    from public.messages m
    inner join user_conversations uc on uc.conversation_id = m.conversation_id
    left join public.message_read_receipts r on r.message_id = m.id and r.user_id = p_user_id
    where m.sender_id <> p_user_id
      and r.id is null
      and m.created_at > uc.last_read_at
      and coalesce(
            nullif(m.metadata ->> 'private_to', '')::uuid,
            '00000000-0000-0000-0000-000000000000'::uuid
          ) in ('00000000-0000-0000-0000-000000000000'::uuid, p_user_id)
    group by m.conversation_id
  )
  select uc.conversation_id,
         coalesce(mc.unread_count, 0) as unread_count,
         mc.last_message_at
  from user_conversations uc
  left join message_counts mc on mc.conversation_id = uc.conversation_id;
$$;

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
      and coalesce(
            nullif(m.metadata ->> 'private_to', '')::uuid,
            '00000000-0000-0000-0000-000000000000'::uuid
          ) in ('00000000-0000-0000-0000-000000000000'::uuid, p_user_id)
    group by cm.conversation_id
  ) as t;
$$;

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
    join public.messages m
      on m.conversation_id = uc.id
     and m.sender_id <> p_user_id
     and coalesce(
           nullif(m.metadata ->> 'private_to', '')::uuid,
           '00000000-0000-0000-0000-000000000000'::uuid
         ) in ('00000000-0000-0000-0000-000000000000'::uuid, p_user_id)
    left join public.message_read_receipts r on r.message_id = m.id and r.user_id = p_user_id
    where r.id is null
    group by uc.id
  )
  select uc.id,
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
               select string_agg(
                 coalesce(nullif(trim(p.first_name || ' ' || p.last_name), ''), p.email),
                 ', '
               )
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

commit;
