-- Private replies in announcements and filtered list RPC
begin;

-- Insert a private reply message into an announcement conversation.
-- Only the recipient (private_to), the sender, and admins should see it via list RPCs.
create or replace function public.post_private_reply(
  p_conversation_id uuid,
  p_body text,
  p_recipient uuid,
  p_parent_message_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_sender uuid := auth.uid();
  v_type text;
begin
  if v_sender is null then raise exception 'Unauthorized'; end if;
  if p_body is null or length(trim(p_body)) = 0 then raise exception 'Body required'; end if;
  select type into v_type from public.conversations where id = p_conversation_id;
  if v_type is distinct from 'announcement' then raise exception 'Private replies are only supported in announcements'; end if;
  -- ensure membership
  if not exists (select 1 from public.conversation_members cm where cm.conversation_id = p_conversation_id and cm.user_id = v_sender) then
    raise exception 'Not a member of conversation';
  end if;

  -- Optional: verify parent message (if provided) belongs to the same conversation
  if p_parent_message_id is not null then
    if not exists (
      select 1 from public.messages pm
      where pm.id = p_parent_message_id and pm.conversation_id = p_conversation_id
    ) then
      raise exception 'Parent/child messages must share conversation';
    end if;
  end if;

  insert into public.messages (conversation_id, sender_id, body, metadata, parent_message_id)
  values (p_conversation_id, v_sender, p_body, jsonb_build_object('private_to', p_recipient), p_parent_message_id)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.post_private_reply(uuid, text, uuid) to authenticated;

-- List messages with sender and private filtering
create or replace function public.list_messages_with_sender_v2(p_conversation_id uuid, p_limit int default 200)
returns table (
  id bigint,
  conversation_id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz,
  first_name text,
  last_name text,
  email text
)
language sql
stable
security definer
set search_path = public
as $$
  with allowed as (
    select m.*
    from public.messages m
    where m.conversation_id = p_conversation_id
      and exists (
        select 1 from public.conversation_members cm
        where cm.conversation_id = p_conversation_id and cm.user_id = auth.uid()
      )
      and (
        -- visible to all: messages without private_to
        coalesce((m.metadata ->> 'private_to')::uuid, '00000000-0000-0000-0000-000000000000'::uuid) = '00000000-0000-0000-0000-000000000000'::uuid
        or (m.metadata ->> 'private_to')::uuid = auth.uid()
        or m.sender_id = auth.uid()
        or public.is_admin(auth.uid())
      )
  )
  select a.id, a.conversation_id, a.sender_id, a.body, a.created_at, p.first_name, p.last_name, p.email
  from allowed a
  join public.profiles p on p.id = a.sender_id
  order by a.created_at asc
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
$$;

grant execute on function public.list_messages_with_sender_v2(uuid, int) to authenticated;

commit;
