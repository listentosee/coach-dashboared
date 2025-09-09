-- SECURITY DEFINER function to create a group conversation and add members
begin;

create or replace function public.create_group_conversation(p_user_ids uuid[], p_title text default null)
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
  if p_user_ids is null or array_length(p_user_ids, 1) is null then
    raise exception 'user_ids required';
  end if;

  -- Create conversation first
  insert into public.conversations(type, title, created_by)
  values ('group', p_title, v_self)
  returning id into v_conversation_id;

  -- Add creator + recipients (distinct)
  insert into public.conversation_members (conversation_id, user_id, role)
  select v_conversation_id, x.id, 'member'
  from (select distinct unnest(array_append(p_user_ids, v_self)) as id) as x
  on conflict do nothing;

  return v_conversation_id;
end;
$$;

grant execute on function public.create_group_conversation(uuid[], text) to authenticated;

commit;
