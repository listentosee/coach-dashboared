-- Fix function return types after UUID migration

-- Drop and recreate get_conversation_messages to return UUID instead of BIGINT
DROP FUNCTION IF EXISTS public.get_conversation_messages(UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.get_conversation_messages(
  p_conversation_id UUID,
  p_limit INTEGER DEFAULT 500
)
RETURNS TABLE (
  id UUID,
  conversation_id UUID,
  sender_id UUID,
  body TEXT,
  created_at TIMESTAMPTZ,
  parent_message_id UUID,
  sender_name TEXT,
  sender_email TEXT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  select v.id, v.conversation_id, v.sender_id, v.body, v.created_at, m.parent_message_id, v.first_name || ' ' || v.last_name as sender_name, v.email as sender_email
  from public.v_messages_with_sender v
  join public.messages m on m.id = v.id
  where v.conversation_id = p_conversation_id
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = p_conversation_id and cm.user_id = auth.uid()
    )
  order by v.created_at asc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- Drop and recreate list_conversations_enriched to remove pinned/pinned_at columns
DROP FUNCTION IF EXISTS public.list_conversations_enriched(UUID);

CREATE OR REPLACE FUNCTION public.list_conversations_enriched(
  p_user_id UUID
)
RETURNS TABLE (
  id UUID,
  type TEXT,
  title TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ,
  unread_count INT,
  last_message_at TIMESTAMPTZ,
  display_title TEXT,
  archived_at TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  with base as (
    select c.id, c.type, c.title, c.created_by, c.created_at,
           cm.last_read_at, cm.archived_at
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
    b.archived_at
  from base b
  left join counts c on c.id = b.id;
$$;

-- Drop and recreate get_thread_messages to return UUID instead of BIGINT
DROP FUNCTION IF EXISTS public.get_thread_messages(BIGINT);

CREATE OR REPLACE FUNCTION public.get_thread_messages(
  p_thread_root_id UUID
)
RETURNS TABLE (
  id UUID,
  sender_id UUID,
  body TEXT,
  created_at TIMESTAMPTZ,
  parent_message_id UUID,
  sender_name TEXT,
  sender_email TEXT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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

-- Drop and recreate mark_messages_read to accept UUID[] instead of BIGINT[]
DROP FUNCTION IF EXISTS public.mark_messages_read(BIGINT[]);

CREATE OR REPLACE FUNCTION public.mark_messages_read(
  p_message_ids UUID[]
)
RETURNS INTEGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count INT;
BEGIN
  INSERT INTO public.message_read_receipts (message_id, user_id)
  SELECT unnest(p_message_ids), auth.uid()
  ON CONFLICT (message_id, user_id) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
