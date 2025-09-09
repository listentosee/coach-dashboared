-- Fix threading trigger to set correct thread_root_id and harden thread fetch
begin;

-- Correct update_thread_stats: use parent's id when parent.thread_root_id is null
create or replace function update_thread_stats()
returns trigger as $$
begin
  if new.parent_message_id is not null then
    -- bump parent stats
    update public.messages
       set thread_reply_count = coalesce(thread_reply_count, 0) + 1,
           thread_last_reply_at = new.created_at
     where id = new.parent_message_id;

    -- set thread root to parent's root or the parent id
    select coalesce(m.thread_root_id, m.id)
      into new.thread_root_id
      from public.messages m
     where m.id = new.parent_message_id;
  end if;
  return new;
end; $$ language plpgsql;

-- Harden get_thread_messages to include children that only have parent_message_id
create or replace function public.get_thread_messages(p_thread_root_id bigint)
returns table (
  id bigint,
  sender_id uuid,
  body text,
  created_at timestamptz,
  parent_message_id bigint,
  sender_name text,
  sender_email text
)
language sql
stable
security definer
set search_path = public
as $$
  with root as (
    select case
      when m.thread_root_id is not null then m.thread_root_id
      when m.parent_message_id is not null then (select coalesce(mm.thread_root_id, mm.id) from public.messages mm where mm.id = m.parent_message_id)
      else m.id
    end as rid,
    m.conversation_id
    from public.messages m
    where m.id = p_thread_root_id
  )
  select 
    m.id,
    m.sender_id,
    m.body,
    m.created_at,
    m.parent_message_id,
    p.first_name || ' ' || p.last_name as sender_name,
    p.email as sender_email
  from public.messages m
  join root r on true
  join public.profiles p on p.id = m.sender_id
  where (
      m.id = r.rid
      or m.thread_root_id = r.rid
      or m.parent_message_id = r.rid
  )
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = r.conversation_id and cm.user_id = auth.uid()
    )
  order by m.created_at asc;
$$;

-- Recompute stats once to repair existing data (skip silently if helper funcs not present)
do $$ begin
  perform public.recompute_thread_roots(null::uuid);
exception when undefined_function then
  -- helper not installed; skip
  null;
end $$;

do $$ begin
  perform public.recompute_thread_stats(null::uuid);
exception when undefined_function then
  -- helper not installed; skip
  null;
end $$;

commit;
