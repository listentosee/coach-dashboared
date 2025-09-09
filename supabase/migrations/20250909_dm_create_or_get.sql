-- Create-or-get DM helper that bypasses RLS safely for authenticated users
begin;

create or replace function public.create_or_get_dm(p_other_user_id uuid, p_title text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_conversation_id uuid;
begin
  if v_self is null then
    raise exception 'Unauthorized';
  end if;
  if p_other_user_id is null then
    raise exception 'Missing target user';
  end if;
  if p_other_user_id = v_self then
    raise exception 'Cannot DM self';
  end if;

  -- Find an existing DM between the two users
  select c.id
    into v_conversation_id
  from public.conversations c
  join public.conversation_members m1 on m1.conversation_id = c.id and m1.user_id = v_self
  join public.conversation_members m2 on m2.conversation_id = c.id and m2.user_id = p_other_user_id
  where c.type = 'dm'
  limit 1;

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  -- Create new DM conversation and add both users
  insert into public.conversations (type, title, created_by)
  values ('dm', p_title, v_self)
  returning id into v_conversation_id;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (v_conversation_id, v_self, 'member'), (v_conversation_id, p_other_user_id, 'member')
  on conflict do nothing;

  return v_conversation_id;
end;
$$;

grant execute on function public.create_or_get_dm(uuid, text) to authenticated;

commit;

