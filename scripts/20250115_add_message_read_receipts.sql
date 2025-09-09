-- Message Read Receipts table, indexes, RLS, and policies

create table if not exists public.message_read_receipts (
  id uuid default gen_random_uuid() primary key,
  message_id bigint not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(message_id, user_id)
);

-- Performance index
create index if not exists idx_message_read_receipts_user
  on public.message_read_receipts(user_id, read_at desc);

-- Enable RLS
alter table public.message_read_receipts enable row level security;

-- RLS: members of the conversation can view receipts
do $$ begin
  create policy "Users can view read receipts in their conversations"
    on public.message_read_receipts
    for select
    using (
      exists (
        select 1 from public.messages m
        join public.conversation_members cm on cm.conversation_id = m.conversation_id
        where m.id = message_read_receipts.message_id
          and cm.user_id = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;

-- RLS: users can insert their own read receipts when members
do $$ begin
  create policy "Users can create their own read receipts"
    on public.message_read_receipts
    for insert
    with check (
      user_id = auth.uid() and exists (
        select 1 from public.messages m
        join public.conversation_members cm on cm.conversation_id = m.conversation_id
        where m.id = message_id and cm.user_id = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;

