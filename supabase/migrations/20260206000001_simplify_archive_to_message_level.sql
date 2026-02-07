-- Simplify archive: derive conversation archive state from message-level flags
--
-- A conversation is "archived" for a user when ALL messages have archived_at set
-- in message_user_state. A new message (no entry in message_user_state) means
-- the conversation is NOT archived — it pops back into the inbox automatically.
--
-- This replaces the old conversation_members.archived_at approach.

-- Drop the old function first because the return type changed
-- (old: archived_at timestamptz → new: all_archived boolean)
DROP FUNCTION IF EXISTS public.list_conversations_enriched(uuid);

CREATE OR REPLACE FUNCTION public.list_conversations_enriched(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  type text,
  title text,
  created_by uuid,
  created_at timestamptz,
  unread_count int,
  last_message_at timestamptz,
  display_title text,
  all_archived boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  with base as (
    select c.id, c.type, c.title, c.created_by, c.created_at,
           cm.last_read_at
    from public.conversations c
    join public.conversation_members cm on cm.conversation_id = c.id
    where cm.user_id = p_user_id
  ),
  counts as (
    select b.id,
           count(m.id)::int as unread_count,
           max(m.created_at) as last_message_at
    from base b
    left join public.messages m on m.conversation_id = b.id
      and m.created_at > b.last_read_at
      and m.sender_id <> p_user_id
    group by b.id
  ),
  archive_state as (
    -- A conversation is archived when it has messages AND all of them are archived
    select b.id,
           count(m.id) as total_messages,
           count(mus.archived_at) as archived_messages
    from base b
    left join public.messages m on m.conversation_id = b.id
    left join public.message_user_state mus
      on mus.message_id = m.id and mus.user_id = p_user_id
    group by b.id
  )
  select
    b.id,
    b.type,
    b.title,
    b.created_by,
    b.created_at,
    coalesce(c.unread_count, 0) as unread_count,
    c.last_message_at,
    case
      when b.type = 'announcement' then coalesce(nullif(trim(b.title), ''), 'Announcement')
      when b.type = 'dm' then coalesce(
        (
          select nullif(trim(p.first_name || ' ' || p.last_name), '')
          from public.conversation_members cm
          join public.profiles p on p.id = cm.user_id
          where cm.conversation_id = b.id and cm.user_id <> p_user_id
          limit 1
        ),
        (
          select p.email
          from public.conversation_members cm
          join public.profiles p on p.id = cm.user_id
          where cm.conversation_id = b.id and cm.user_id <> p_user_id
          limit 1
        ),
        'Direct Message'
      )
      when b.type = 'group' then coalesce(
        nullif(trim(b.title), ''),
        (
          select string_agg(
            coalesce(nullif(trim(p.first_name || ' ' || p.last_name), ''), p.email),
            ', '
          )
          from public.conversation_members cm
          join public.profiles p on p.id = cm.user_id
          where cm.conversation_id = b.id and cm.user_id <> p_user_id
        ),
        'Group Conversation'
      )
      else coalesce(nullif(trim(b.title), ''), 'Conversation')
    end as display_title,
    -- all_archived: true when conversation has messages and every one is archived
    (a.total_messages > 0 and a.total_messages = a.archived_messages) as all_archived
  from base b
  left join counts c on c.id = b.id
  left join archive_state a on a.id = b.id;
$$;
