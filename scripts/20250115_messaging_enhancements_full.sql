-- Complete migration for messaging enhancements (read receipts + threading + group convos)

begin;

-- 0) Extend conversation types and update insert policy
alter table public.conversations drop constraint if exists conversations_type_check;
alter table public.conversations
  add constraint conversations_type_check check (type in ('dm','group','announcement'));

do $$ begin
  drop policy if exists messages_insert_allowed on public.messages;
exception when undefined_object then null; end $$;

do $$ begin
  create policy messages_insert_allowed on public.messages
    for insert with check (
      public.is_admin(auth.uid()) OR (
        exists (
          select 1 from public.conversation_members m
          where m.conversation_id = messages.conversation_id
            and m.user_id = auth.uid()
            and (m.muted_until is null or m.muted_until < now())
        )
        and (
          select c.type from public.conversations c where c.id = messages.conversation_id
        ) in ('dm','group')
      )
    );
exception when duplicate_object then null; end $$;

-- 1) Read Receipts Table
create table if not exists public.message_read_receipts (
  id uuid default gen_random_uuid() primary key,
  message_id bigint not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(message_id, user_id)
);

-- 2) Indexes for Read Receipts
create index if not exists idx_message_read_receipts_user on public.message_read_receipts(user_id, read_at desc);

-- 3) Enable RLS
alter table public.message_read_receipts enable row level security;

-- 4) RLS Policies for Read Receipts
do $$ begin
  create policy "Users can view read receipts in their conversations" 
    on public.message_read_receipts
    for select using (
      exists (
        select 1 from public.messages m
        join public.conversation_members cm on cm.conversation_id = m.conversation_id
        where m.id = message_read_receipts.message_id
          and cm.user_id = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Users can create their own read receipts" 
    on public.message_read_receipts
    for insert with check (
      user_id = auth.uid() and exists (
        select 1
        from public.messages m
        join public.conversation_members cm on cm.conversation_id = m.conversation_id
        where m.id = message_id and cm.user_id = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;

-- 5) Threading Support
alter table public.messages 
  add column if not exists parent_message_id bigint references public.messages(id) on delete set null,
  add column if not exists thread_root_id bigint references public.messages(id) on delete set null,
  add column if not exists thread_reply_count int default 0,
  add column if not exists thread_last_reply_at timestamptz;

-- 6) Threading Indexes
create index if not exists idx_messages_parent on public.messages(parent_message_id) where parent_message_id is not null;
create index if not exists idx_messages_thread_root on public.messages(thread_root_id) where thread_root_id is not null;
create index if not exists idx_messages_thread_activity on public.messages(conversation_id, thread_last_reply_at desc)
  where thread_root_id is null and thread_reply_count > 0;

-- 7) Thread Statistics Trigger
create or replace function update_thread_stats()
returns trigger as $$
begin
  if new.parent_message_id is not null then
    update public.messages 
      set thread_reply_count = thread_reply_count + 1,
          thread_last_reply_at = new.created_at
      where id = new.parent_message_id;

    select coalesce(thread_root_id, parent_message_id) into new.thread_root_id
      from public.messages where id = new.parent_message_id;
  end if;
  return new;
end; $$ language plpgsql;

drop trigger if exists trigger_update_thread_stats on public.messages;
create trigger trigger_update_thread_stats
  before insert on public.messages
  for each row execute function update_thread_stats();

-- 8) Integrity: enforce replies remain in same conversation
create or replace function enforce_same_conversation()
returns trigger as $$
declare v_parent uuid; begin
  if new.parent_message_id is null then return new; end if;
  select conversation_id into v_parent from public.messages where id = new.parent_message_id;
  if v_parent is null or v_parent <> new.conversation_id then
    raise exception 'Parent/child messages must share conversation';
  end if;
  return new;
end; $$ language plpgsql;

drop trigger if exists trg_enforce_same_conversation on public.messages;
create trigger trg_enforce_same_conversation
  before insert or update on public.messages
  for each row execute function enforce_same_conversation();

-- 9) Functions
create or replace function public.mark_messages_read(p_message_ids bigint[])
returns integer language plpgsql security definer set search_path = public as $$
declare v_count int; begin
  insert into public.message_read_receipts (message_id, user_id)
  select unnest(p_message_ids), auth.uid()
  on conflict (message_id, user_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

create or replace function public.get_message_read_status(p_message_ids bigint[])
returns table (message_id bigint, read_count integer, readers jsonb)
language sql stable security definer set search_path = public as $$
  select m.id,
         count(r.user_id)::int,
         coalesce(jsonb_agg(jsonb_build_object(
           'user_id', r.user_id,
           'read_at', r.read_at,
           'first_name', p.first_name,
           'last_name', p.last_name
         ) order by r.read_at desc) filter (where r.user_id is not null), '[]'::jsonb)
  from unnest(p_message_ids) as m(id)
  join public.messages msg on msg.id = m.id
  join public.conversation_members cm on cm.conversation_id = msg.conversation_id and cm.user_id = auth.uid()
  left join public.message_read_receipts r on r.message_id = m.id
  left join public.profiles p on p.id = r.user_id
  group by m.id;
$$;

create or replace function public.get_unread_counts(p_user_id uuid default auth.uid())
returns table (
  conversation_id uuid,
  unread_count integer,
  last_message_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with user_conversations as (
    select cm.conversation_id, cm.last_read_at
    from public.conversation_members cm
    where cm.user_id = p_user_id
  ),
  message_counts as (
    select m.conversation_id, count(*)::int as unread_count, max(m.created_at) as last_message_at
    from public.messages m
    inner join user_conversations uc on uc.conversation_id = m.conversation_id
    left join public.message_read_receipts r on r.message_id = m.id and r.user_id = p_user_id
    where m.sender_id != p_user_id and r.id is null and m.created_at > uc.last_read_at
    group by m.conversation_id
  )
  select uc.conversation_id, coalesce(mc.unread_count, 0) as unread_count, mc.last_message_at
  from user_conversations uc
  left join message_counts mc on mc.conversation_id = uc.conversation_id;
$$;

create or replace function public.mark_conversation_read_v2(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_ts timestamptz; begin
  select max(created_at) into v_ts from public.messages where conversation_id = p_conversation_id;
  update public.conversation_members cm
     set last_read_at = greatest(coalesce(v_ts, now()), cm.last_read_at)
   where cm.conversation_id = p_conversation_id and cm.user_id = auth.uid();
end; $$;

-- 10) Thread RPC
create or replace function public.get_thread_messages(p_thread_root_id bigint)
returns table (id bigint, sender_id uuid, body text, created_at timestamptz, parent_message_id bigint, sender_name text, sender_email text)
language sql stable security definer set search_path = public as $$
  select m.id, m.sender_id, m.body, m.created_at, m.parent_message_id,
         p.first_name || ' ' || p.last_name as sender_name,
         p.email as sender_email
  from public.messages m
  join public.profiles p on p.id = m.sender_id
  where (m.id = p_thread_root_id or m.thread_root_id = p_thread_root_id)
    and exists (
      select 1 from public.messages root
      join public.conversation_members cm on cm.conversation_id = root.conversation_id
      where root.id = p_thread_root_id and cm.user_id = auth.uid()
    )
  order by m.created_at asc;
$$;

grant execute on function public.mark_messages_read(bigint[]) to authenticated;
grant execute on function public.get_message_read_status(bigint[]) to authenticated;
grant execute on function public.get_unread_counts(uuid) to authenticated;
grant execute on function public.mark_conversation_read_v2(uuid) to authenticated;
grant execute on function public.get_thread_messages(bigint) to authenticated;

commit;

