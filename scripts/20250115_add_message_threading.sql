-- Add threading support to messages

alter table public.messages 
  add column if not exists parent_message_id bigint references public.messages(id) on delete set null,
  add column if not exists thread_root_id bigint references public.messages(id) on delete set null,
  add column if not exists thread_reply_count int default 0,
  add column if not exists thread_last_reply_at timestamptz;

-- Indexes for threading
create index if not exists idx_messages_parent on public.messages(parent_message_id)
  where parent_message_id is not null;
create index if not exists idx_messages_thread_root on public.messages(thread_root_id)
  where thread_root_id is not null;
create index if not exists idx_messages_thread_activity on public.messages(conversation_id, thread_last_reply_at desc)
  where thread_root_id is null and thread_reply_count > 0;

-- Trigger to maintain thread statistics
create or replace function update_thread_stats()
returns trigger as $$
begin
  if new.parent_message_id is not null then
    update public.messages 
    set 
      thread_reply_count = thread_reply_count + 1,
      thread_last_reply_at = new.created_at
    where id = new.parent_message_id;

    select coalesce(thread_root_id, parent_message_id) 
      into new.thread_root_id
    from public.messages 
    where id = new.parent_message_id;
  end if;
  return new;
end; $$ language plpgsql;

drop trigger if exists trigger_update_thread_stats on public.messages;
create trigger trigger_update_thread_stats
  before insert on public.messages
  for each row
  execute function update_thread_stats();

-- Enforce replies stay in same conversation
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

