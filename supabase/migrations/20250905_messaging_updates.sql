-- Delta updates for messaging schema: mute, read tracking, and safe updates

-- Add columns to conversation_members for moderation and read tracking
alter table public.conversation_members
  add column if not exists muted_until timestamptz null,
  add column if not exists last_read_at timestamptz not null default now();

-- Recreate messages insert policy to respect mute (drop then create)
do $$ begin
  drop policy if exists messages_insert_allowed on public.messages;
exception when undefined_object then null; end $$;

do $$ begin
  create policy messages_insert_allowed on public.messages
    for insert with check (
      public.is_admin(auth.uid())
      or (
        exists (
          select 1 from public.conversation_members m
          where m.conversation_id = messages.conversation_id
            and m.user_id = auth.uid()
            and (m.muted_until is null or m.muted_until < now())
        )
        and (
          select c.type from public.conversations c where c.id = messages.conversation_id
        ) = 'dm'
      )
    );
exception when duplicate_object then null; end $$;

-- Minimal, RLS-safe directory functions using SECURITY DEFINER
-- List all coaches with minimal fields
create or replace function public.list_coaches_minimal()
returns table (id uuid, first_name text, last_name text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.first_name, p.last_name, p.email
  from public.profiles p
  where p.role = 'coach';
$$;

-- List all admins with minimal fields
create or replace function public.list_admins_minimal()
returns table (id uuid, first_name text, last_name text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.first_name, p.last_name, p.email
  from public.profiles p
  where p.role = 'admin';
$$;

grant execute on function public.list_coaches_minimal() to authenticated;
grant execute on function public.list_admins_minimal() to authenticated;

-- Optional: unread count RPC for performance
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
    group by cm.conversation_id
  ) as t;
$$;

grant execute on function public.count_unread_messages(uuid) to authenticated;

-- Conversations with unread counts for a given user
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
    -- Use count(m.id) so that conversations with no unread messages return 0, not 1
    select b.id, count(m.id)::int as unread_count,
           max(m.created_at) as last_message_at
    from base b
    left join public.messages m
      on m.conversation_id = b.id
     and m.created_at > b.last_read_at
     and m.sender_id <> p_user_id
    group by b.id
  )
  select b.id, b.type, b.title, b.created_by, b.created_at,
         coalesce(c.unread_count, 0) as unread_count,
         c.last_message_at
  from base b
  left join counts c on c.id = b.id
  order by coalesce(c.last_message_at, b.created_at) desc;
$$;

grant execute on function public.list_conversations_with_unread(uuid) to authenticated;

-- Unified minimal user directory (admins + coaches)
create or replace function public.list_users_minimal()
returns table (id uuid, first_name text, last_name text, email text, role text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.first_name, p.last_name, p.email, p.role
  from public.profiles p
  where p.role in ('admin','coach');
$$;

grant execute on function public.list_users_minimal() to authenticated;

-- Allow admins to update conversation_members (e.g., mute/unmute)
do $$ begin
  create policy convo_members_update_admin on public.conversation_members
    for update using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
exception when duplicate_object then null; end $$;

-- Allow members to update only their last_read_at safely
-- Enforce no changes to role or muted_until by comparing existing values
do $$ begin
  create policy convo_members_update_self_read on public.conversation_members
    for update using (user_id = auth.uid())
    with check (
      user_id = auth.uid()
      and role = (select role from public.conversation_members where conversation_id = conversation_members.conversation_id and user_id = conversation_members.user_id)
      and (muted_until is not distinct from (select muted_until from public.conversation_members where conversation_id = conversation_members.conversation_id and user_id = conversation_members.user_id))
    );
exception when duplicate_object then null; end $$;

-- Safer read marker: security definer function to set last_read_at
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversation_members cm
     set last_read_at = greatest(
       cm.last_read_at,
       coalesce((select max(m.created_at) from public.messages m where m.conversation_id = p_conversation_id), now())
     )
   where cm.conversation_id = p_conversation_id
     and cm.user_id = auth.uid();
end;
$$;

grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- Fix messages select policy to properly correlate on the message row
do $$ begin
  drop policy if exists messages_select_member on public.messages;
exception when undefined_object then null; end $$;

do $$ begin
  create policy messages_select_member on public.messages
    for select using (
      exists (
        select 1 from public.conversation_members m
        where m.conversation_id = messages.conversation_id
          and m.user_id = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;

-- Views to simplify app joins
create or replace view public.v_conversation_members_with_profile as
  select cm.conversation_id,
         cm.user_id,
         cm.role,
         cm.joined_at,
         p.first_name,
         p.last_name,
         p.email
  from public.conversation_members cm
  join public.profiles p on p.id = cm.user_id;

create or replace view public.v_messages_with_sender as
  select m.id,
         m.conversation_id,
         m.sender_id,
         m.body,
         m.created_at,
         p.first_name,
         p.last_name,
         p.email
  from public.messages m
  join public.profiles p on p.id = m.sender_id;

-- RPC: list messages with sender info (RLS-safe)
create or replace function public.list_messages_with_sender(p_conversation_id uuid, p_limit int default 200)
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
  select v.id, v.conversation_id, v.sender_id, v.body, v.created_at, v.first_name, v.last_name, v.email
  from public.v_messages_with_sender v
  where v.conversation_id = p_conversation_id
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = p_conversation_id and cm.user_id = auth.uid()
    )
  order by v.created_at asc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

grant execute on function public.list_messages_with_sender(uuid, int) to authenticated;

-- RPC: list members with profile for a conversation (RLS-safe)
create or replace function public.list_members_with_profile(p_conversation_id uuid)
returns table (
  user_id uuid,
  first_name text,
  last_name text,
  email text,
  role text,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select v.user_id, v.first_name, v.last_name, v.email, cm.role, cm.joined_at
  from public.conversation_members cm
  join public.v_conversation_members_with_profile v
    on v.conversation_id = cm.conversation_id and v.user_id = cm.user_id
  where cm.conversation_id = p_conversation_id
    and exists (
      select 1 from public.conversation_members self
      where self.conversation_id = p_conversation_id and self.user_id = auth.uid()
    );
$$;

grant execute on function public.list_members_with_profile(uuid) to authenticated;

-- RPC: create a new announcement conversation and broadcast to all coaches
create or replace function public.create_announcement_and_broadcast(p_title text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Forbidden';
  end if;

  insert into public.conversations (type, title, created_by)
  values ('announcement', coalesce(p_title, 'Announcement'), auth.uid())
  returning id into v_conversation_id;

  -- add all coaches as members
  insert into public.conversation_members (conversation_id, user_id, role)
  select v_conversation_id, p.id, 'member'
  from public.profiles p
  where p.role = 'coach'
  on conflict do nothing;

  -- add admins too, to ensure visibility
  insert into public.conversation_members (conversation_id, user_id, role)
  select v_conversation_id, p.id, 'member'
  from public.profiles p
  where p.role = 'admin'
  on conflict do nothing;

  -- insert the announcement message
  insert into public.messages (conversation_id, sender_id, body)
  values (v_conversation_id, auth.uid(), p_body);

  return v_conversation_id;
end;
$$;

grant execute on function public.create_announcement_and_broadcast(text, text) to authenticated;
