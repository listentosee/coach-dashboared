-- Functions for read receipts and unread counts

-- Mark multiple messages as read for current user
create or replace function public.mark_messages_read(p_message_ids bigint[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer; begin
  insert into public.message_read_receipts (message_id, user_id)
  select unnest(p_message_ids), auth.uid()
  on conflict (message_id, user_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

-- Get read status for multiple messages (membership-aware)
create or replace function public.get_message_read_status(p_message_ids bigint[])
returns table (
  message_id bigint,
  read_count integer,
  readers jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select 
    m.id as message_id,
    count(r.user_id)::int as read_count,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_id', r.user_id,
          'read_at', r.read_at,
          'first_name', p.first_name,
          'last_name', p.last_name
        ) order by r.read_at desc
      ) filter (where r.user_id is not null), 
      '[]'::jsonb
    ) as readers
  from unnest(p_message_ids) as m(id)
  join public.messages msg on msg.id = m.id
  join public.conversation_members cm
    on cm.conversation_id = msg.conversation_id and cm.user_id = auth.uid()
  left join public.message_read_receipts r on r.message_id = m.id
  left join public.profiles p on p.id = r.user_id
  group by m.id;
$$;

-- Optimized unread counts per conversation for a user
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
    select 
      cm.conversation_id,
      cm.last_read_at
    from public.conversation_members cm
    where cm.user_id = p_user_id
  ),
  message_counts as (
    select 
      m.conversation_id,
      count(*)::int as unread_count,
      max(m.created_at) as last_message_at
    from public.messages m
    inner join user_conversations uc on uc.conversation_id = m.conversation_id
    left join public.message_read_receipts r on r.message_id = m.id and r.user_id = p_user_id
    where 
      m.sender_id != p_user_id
      and r.id is null
      and m.created_at > uc.last_read_at
    group by m.conversation_id
  )
  select 
    uc.conversation_id,
    coalesce(mc.unread_count, 0) as unread_count,
    mc.last_message_at
  from user_conversations uc
  left join message_counts mc on mc.conversation_id = uc.conversation_id;
$$;

-- Mark conversation read using latest message timestamp (watermark semantics)
create or replace function public.mark_conversation_read_v2(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_ts timestamptz; begin
  select max(created_at) into v_ts from public.messages where conversation_id = p_conversation_id;
  update public.conversation_members cm
     set last_read_at = greatest(coalesce(v_ts, now()), cm.last_read_at)
   where cm.conversation_id = p_conversation_id and cm.user_id = auth.uid();
end; $$;

grant execute on function public.mark_messages_read(bigint[]) to authenticated;
grant execute on function public.get_message_read_status(bigint[]) to authenticated;
grant execute on function public.get_unread_counts(uuid) to authenticated;
grant execute on function public.mark_conversation_read_v2(uuid) to authenticated;

