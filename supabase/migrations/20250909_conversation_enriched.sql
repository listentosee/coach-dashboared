-- Conversations enriched with display titles per UI rules
begin;

create or replace function public.list_conversations_enriched(p_user_id uuid)
returns table (
  id uuid,
  type text,
  title text,
  created_by uuid,
  created_at timestamptz,
  unread_count integer,
  last_message_at timestamptz,
  display_title text
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    -- Use existing unread logic to keep behavior consistent
    select * from public.list_conversations_with_unread(p_user_id)
  )
  select 
    b.id,
    b.type,
    b.title,
    b.created_by,
    b.created_at,
    b.unread_count,
    b.last_message_at,
    case
      when b.type = 'announcement' then coalesce(nullif(trim(b.title), ''), 'Announcement')
      when b.type = 'dm' then coalesce(
        (
          select nullif(trim(p.first_name || ' ' || p.last_name), '')
          from public.conversation_members cm
          join public.profiles p on p.id = cm.user_id
          where cm.conversation_id = b.id
            and cm.user_id <> p_user_id
          limit 1
        ),
        (
          select p.email
          from public.conversation_members cm
          join public.profiles p on p.id = cm.user_id
          where cm.conversation_id = b.id
            and cm.user_id <> p_user_id
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
          where cm.conversation_id = b.id
            and cm.user_id <> p_user_id
        ),
        'Group Conversation'
      )
      else b.title
    end as display_title
  from base b
  order by coalesce(b.last_message_at, b.created_at) desc;
$$;

commit;

