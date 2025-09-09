-- Update get_thread_messages to accept either root or child message id

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
      when m.parent_message_id is not null then (select coalesce(mm.thread_root_id, m.parent_message_id) from public.messages mm where mm.id = m.parent_message_id)
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
  where (m.id = r.rid or m.thread_root_id = r.rid)
  and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = r.conversation_id and cm.user_id = auth.uid()
  )
  order by m.created_at asc;
$$;

grant execute on function public.get_thread_messages(bigint) to authenticated;

