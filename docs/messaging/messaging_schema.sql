-- Supabase-native messaging schema (DMs + Announcements)
-- Tables, indexes, RLS policies, and realtime publication

-- Helper: admin check based on existing profiles.role
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role = 'admin'
  );
$$;

-- conversations: 'dm' (two-party) or 'announcement' (admin broadcast)
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('dm','announcement')),
  title text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- conversation_members: which users can see a conversation
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists idx_conversation_members_user on public.conversation_members(user_id);

-- messages: content in conversations
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete restrict,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_messages_conversation_created_at on public.messages(conversation_id, created_at desc);

-- Enable RLS
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

-- conversations policies
do $$ begin
  create policy conversations_select_admin on public.conversations
    for select using (public.is_admin(auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy conversations_select_member on public.conversations
    for select using (
      exists (
        select 1 from public.conversation_members m
        where m.conversation_id = id and m.user_id = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy conversations_insert_admin on public.conversations
    for insert with check (public.is_admin(auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy conversations_update_admin on public.conversations
    for update using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy conversations_delete_admin on public.conversations
    for delete using (public.is_admin(auth.uid()));
exception when duplicate_object then null; end $$;

-- conversation_members policies
do $$ begin
  create policy convo_members_select_admin on public.conversation_members
    for select using (public.is_admin(auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy convo_members_select_self on public.conversation_members
    for select using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy convo_members_insert_admin on public.conversation_members
    for insert with check (public.is_admin(auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy convo_members_delete_admin on public.conversation_members
    for delete using (public.is_admin(auth.uid()));
exception when duplicate_object then null; end $$;

-- messages policies
do $$ begin
  create policy messages_select_admin on public.messages
    for select using (public.is_admin(auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy messages_select_member on public.messages
    for select using (
      exists (
        select 1 from public.conversation_members m
        where m.conversation_id = conversation_id and m.user_id = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;

-- Only admins can post to 'announcement' conversations; members can post to 'dm'
do $$ begin
  create policy messages_insert_allowed on public.messages
    for insert with check (
      public.is_admin(auth.uid())
      or (
        exists (
          select 1 from public.conversation_members m
          where m.conversation_id = messages.conversation_id and m.user_id = auth.uid()
        )
        and (
          select c.type from public.conversations c where c.id = messages.conversation_id
        ) = 'dm'
      )
    );
exception when duplicate_object then null; end $$;

-- Optionally allow admins to delete/edit messages; block others
do $$ begin
  create policy messages_update_admin on public.messages
    for update using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy messages_delete_admin on public.messages
    for delete using (public.is_admin(auth.uid()));
exception when duplicate_object then null; end $$;

-- Realtime: add messages table to publication
alter publication supabase_realtime add table public.messages;

-- Optional helper: create a global Announcements conversation
-- Replace :admin_uuid before executing if you want to seed immediately
-- insert into public.conversations (type, title, created_by)
-- values ('announcement', 'Announcements', ':admin_uuid'::uuid)
-- on conflict do nothing;

-- To add all coaches as members of Announcements:
-- insert into public.conversation_members (conversation_id, user_id)
-- select c.id, p.id
-- from public.conversations c, public.profiles p
-- where c.type = 'announcement' and p.role = 'coach'
-- on conflict do nothing;

-- Notes:
-- - Admins (profiles.role = 'admin') can see and write everywhere.
-- - Coaches only see conversations they are members of; they can write only in 'dm' conversations.
-- - Use a DM per coach for private replies; use one global 'announcement' conversation for broadcasts (read-only for coaches).

