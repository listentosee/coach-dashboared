-- Extend conversation types to include 'group' and update message insert policy

-- 1) Extend conversation types
alter table public.conversations
  drop constraint if exists conversations_type_check;

alter table public.conversations
  add constraint conversations_type_check
  check (type in ('dm','group','announcement'));

-- 2) Update messages insert policy to allow members in 'dm' and 'group' (admins anywhere)
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

