-- List threads for a conversation: root message + reply/read stats

create or replace function public.list_threads(p_conversation_id uuid, p_limit int default 200)
returns table (
  root_id bigint,
  sender_id uuid,
  created_at timestamptz,
  snippet text,
  reply_count integer,
  last_reply_at timestamptz,
  read_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  with membership as (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id and cm.user_id = auth.uid()
  ),
  roots as (
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
  )
  select 
    rt.root_id,
    rt.sender_id,
    rt.created_at,
    left(regexp_replace(rt.body, '\n+', ' ', 'g'), 160) as snippet,
    rt.reply_count,
    rt.thread_last_reply_at as last_reply_at,
    coalesce(rd.read_count, 0) as read_count
  from roots rt
  left join reads rd on rd.message_id = rt.root_id
  where exists (select 1 from membership)
  order by coalesce(rt.thread_last_reply_at, rt.created_at) desc
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
$$;

grant execute on function public.list_threads(uuid, int) to authenticated;

