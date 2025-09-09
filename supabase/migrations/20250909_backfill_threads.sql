-- Backfill and maintenance for message threading
begin;

-- Set thread_root_id for existing messages based on parent chain
create or replace function public.recompute_thread_roots(p_conversation_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_root bigint;
begin
  for r in
    select m.id, m.parent_message_id
    from public.messages m
    where m.parent_message_id is not null
      and (p_conversation_id is null or m.conversation_id = p_conversation_id)
  loop
    -- find root: if parent has thread_root_id use it else use parent id
    select coalesce(pm.thread_root_id, pm.id)
      into v_root
    from public.messages pm
    where pm.id = r.parent_message_id;

    update public.messages set thread_root_id = v_root where id = r.id and (thread_root_id is null or thread_root_id <> v_root);
  end loop;
end;
$$;

grant execute on function public.recompute_thread_roots(uuid) to authenticated;

-- Recompute reply counts and last_reply_at for roots
create or replace function public.recompute_thread_stats(p_conversation_id uuid default null)
returns void
language sql
security definer
set search_path = public
as $$
  with roots as (
    select distinct coalesce(m.thread_root_id, m.id) as rid
    from public.messages m
    where (p_conversation_id is null or m.conversation_id = p_conversation_id)
      and (m.parent_message_id is not null or exists (
            select 1 from public.messages c where c.parent_message_id = m.id))
  ), agg as (
    select r.rid,
           count(c.id)::int as reply_count,
           max(c.created_at) as last_reply_at
    from roots r
    left join public.messages c on c.thread_root_id = r.rid
    group by r.rid
  )
  update public.messages m
     set thread_reply_count = coalesce(a.reply_count, 0),
         thread_last_reply_at = a.last_reply_at
    from agg a
   where m.id = a.rid;
$$;

grant execute on function public.recompute_thread_stats(uuid) to authenticated;

-- One-time backfill across all conversations
select public.recompute_thread_roots(null);
select public.recompute_thread_stats(null);

commit;

