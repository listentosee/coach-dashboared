-- Threading RPC to fetch a thread

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
  select 
    m.id,
    m.sender_id,
    m.body,
    m.created_at,
    m.parent_message_id,
    p.first_name || ' ' || p.last_name as sender_name,
    p.email as sender_email
  from public.messages m
  join public.profiles p on p.id = m.sender_id
  where (m.id = p_thread_root_id or m.thread_root_id = p_thread_root_id)
  and exists (
    select 1 from public.messages root
    join public.conversation_members cm on cm.conversation_id = root.conversation_id
    where root.id = p_thread_root_id
      and cm.user_id = auth.uid()
  )
  order by m.created_at asc;
$$;

grant execute on function public.get_thread_messages(bigint) to authenticated;

