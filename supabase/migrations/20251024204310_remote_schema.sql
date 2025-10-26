revoke delete on table "public"."coach_library_documents" from "anon";

revoke insert on table "public"."coach_library_documents" from "anon";

revoke references on table "public"."coach_library_documents" from "anon";

revoke select on table "public"."coach_library_documents" from "anon";

revoke trigger on table "public"."coach_library_documents" from "anon";

revoke truncate on table "public"."coach_library_documents" from "anon";

revoke update on table "public"."coach_library_documents" from "anon";

revoke delete on table "public"."coach_library_documents" from "authenticated";

revoke insert on table "public"."coach_library_documents" from "authenticated";

revoke references on table "public"."coach_library_documents" from "authenticated";

revoke select on table "public"."coach_library_documents" from "authenticated";

revoke trigger on table "public"."coach_library_documents" from "authenticated";

revoke truncate on table "public"."coach_library_documents" from "authenticated";

revoke update on table "public"."coach_library_documents" from "authenticated";

revoke delete on table "public"."coach_library_documents" from "service_role";

revoke insert on table "public"."coach_library_documents" from "service_role";

revoke references on table "public"."coach_library_documents" from "service_role";

revoke select on table "public"."coach_library_documents" from "service_role";

revoke trigger on table "public"."coach_library_documents" from "service_role";

revoke truncate on table "public"."coach_library_documents" from "service_role";

revoke update on table "public"."coach_library_documents" from "service_role";

drop function if exists "public"."job_queue_mark_failed"(p_id uuid, p_error text, p_retry_in interval);

alter table "public"."activity_logs" alter column "id" set default extensions.uuid_generate_v4();

alter table "public"."competitors" alter column "id" set default extensions.uuid_generate_v4();

alter table "public"."game_platform_profiles" alter column "id" set default extensions.uuid_generate_v4();

alter table "public"."game_platform_stats" alter column "id" set default extensions.uuid_generate_v4();

alter table "public"."game_platform_sync_events" alter column "id" set default extensions.uuid_generate_v4();

alter table "public"."game_platform_sync_runs" alter column "id" set default extensions.uuid_generate_v4();

alter table "public"."game_platform_teams" alter column "id" set default extensions.uuid_generate_v4();

alter table "public"."system_config" alter column "id" set default extensions.uuid_generate_v4();

alter table "public"."team_members" alter column "id" set default extensions.uuid_generate_v4();

alter table "public"."teams" alter column "id" set default extensions.uuid_generate_v4();

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.archive_all_messages_in_conversation(p_conversation_id uuid, p_user_id uuid DEFAULT auth.uid())
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Verify user has access to the conversation
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_members cm
    WHERE cm.conversation_id = p_conversation_id AND cm.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Access denied: User is not a member of this conversation';
  END IF;

  -- Archive all messages in the conversation for this user
  INSERT INTO public.message_user_state (user_id, message_id, archived_at)
  SELECT p_user_id, m.id, NOW()
  FROM public.messages m
  WHERE m.conversation_id = p_conversation_id
  ON CONFLICT (user_id, message_id)
  DO UPDATE SET archived_at = NOW(), updated_at = NOW();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.archive_message_user(p_message_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Verify user has access to the message
  IF NOT EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
    WHERE m.id = p_message_id AND cm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: User is not a member of this conversation';
  END IF;

  -- Archive the message for this user only
  INSERT INTO public.message_user_state (user_id, message_id, archived_at)
  VALUES (auth.uid(), p_message_id, NOW())
  ON CONFLICT (user_id, message_id)
  DO UPDATE SET archived_at = NOW(), updated_at = NOW();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_team_size()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF (SELECT COUNT(*) FROM team_members WHERE team_id = NEW.team_id) >= 6 THEN
        RAISE EXCEPTION 'Team cannot have more than 6 members';
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.count_unread_by_receipts(p_user_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(sum(t.cnt), 0)::int from (
    select count(*) as cnt
    from public.conversation_members cm
    join public.messages m on m.conversation_id = cm.conversation_id
    left join public.message_read_receipts r on r.message_id = m.id and r.user_id = p_user_id
    where cm.user_id = p_user_id
      and m.sender_id <> p_user_id
      and r.id is null
      and coalesce(
            nullif(m.metadata ->> 'private_to', '')::uuid,
            '00000000-0000-0000-0000-000000000000'::uuid
          ) in ('00000000-0000-0000-0000-000000000000'::uuid, p_user_id)
    group by cm.conversation_id
  ) as t;
$function$
;

CREATE OR REPLACE FUNCTION public.count_unread_messages(p_user_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(sum(t.cnt), 0)::int from (
    select count(*) as cnt
    from public.conversation_members cm
    join public.messages m on m.conversation_id = cm.conversation_id
    where cm.user_id = p_user_id
      and m.created_at > cm.last_read_at
      and m.sender_id <> p_user_id
    group by cm.conversation_id
  ) as t;
$function$
;

CREATE OR REPLACE FUNCTION public.create_announcement_and_broadcast(p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_conversation_id uuid;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Forbidden';
  end if;

  insert into public.conversations (type, title, created_by)
  values ('announcement', 'Announcement', auth.uid())
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
$function$
;

CREATE OR REPLACE FUNCTION public.create_announcement_and_broadcast(p_title text, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.create_cron_job(job_name text, job_schedule text, task_type text, task_payload jsonb DEFAULT '{}'::jsonb, max_attempts integer DEFAULT 3)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
declare
  new_job_id bigint;
begin
  -- Validate job name doesn't already exist
  if exists (select 1 from cron.job where jobname = job_name) then
    raise exception 'Cron job already exists: %', job_name;
  end if;

  -- Create the cron job
  select cron.schedule(
    job_name := job_name,
    schedule := job_schedule,
    command  := format(
      $cmd$
        select public.job_queue_enqueue(
          p_task_type := %L,
          p_payload := %L::jsonb,
          p_run_at := now(),
          p_max_attempts := %s
        );
      $cmd$,
      task_type,
      task_payload::text,
      max_attempts
    )
  ) into new_job_id;

  return new_job_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_dm_conversation(p_other_user_id uuid, p_title text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_conversation_id UUID;
  v_current_user_id UUID;
BEGIN
  -- Get current user
  v_current_user_id := auth.uid();

  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_other_user_id IS NULL THEN
    RAISE EXCEPTION 'Other user ID is required';
  END IF;

  IF p_other_user_id = v_current_user_id THEN
    RAISE EXCEPTION 'Cannot create DM with self';
  END IF;

  -- Create conversation
  INSERT INTO public.conversations (type, title, created_by)
  VALUES ('dm', p_title, v_current_user_id)
  RETURNING id INTO v_conversation_id;

  -- Add both users as members
  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES
    (v_conversation_id, v_current_user_id),
    (v_conversation_id, p_other_user_id);

  RETURN v_conversation_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_group_conversation(p_user_ids uuid[], p_title text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_conversation_id UUID;
  v_current_user_id UUID;
  v_user_id UUID;
BEGIN
  -- Get current user
  v_current_user_id := auth.uid();

  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) = 0 THEN
    RAISE EXCEPTION 'At least one member is required';
  END IF;

  -- Create conversation
  INSERT INTO public.conversations (type, title, created_by)
  VALUES ('group', p_title, v_current_user_id)
  RETURNING id INTO v_conversation_id;

  -- Add all members (including creator)
  FOREACH v_user_id IN ARRAY p_user_ids
  LOOP
    INSERT INTO public.conversation_members (conversation_id, user_id)
    VALUES (v_conversation_id, v_user_id)
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN v_conversation_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_or_get_dm(p_other_user_id uuid, p_title text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_self uuid := auth.uid();
  v_conversation_id uuid;
begin
  if v_self is null then
    raise exception 'Unauthorized';
  end if;
  if p_other_user_id is null then
    raise exception 'Missing target user';
  end if;
  if p_other_user_id = v_self then
    raise exception 'Cannot DM self';
  end if;

  -- Find an existing DM between the two users
  select c.id
    into v_conversation_id
  from public.conversations c
  join public.conversation_members m1 on m1.conversation_id = c.id and m1.user_id = v_self
  join public.conversation_members m2 on m2.conversation_id = c.id and m2.user_id = p_other_user_id
  where c.type = 'dm'
  limit 1;

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  -- Create new DM conversation and add both users
  insert into public.conversations (type, title, created_by)
  values ('dm', p_title, v_self)
  returning id into v_conversation_id;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (v_conversation_id, v_self, 'member'), (v_conversation_id, p_other_user_id, 'member')
  on conflict do nothing;

  return v_conversation_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_same_conversation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare v_parent uuid; begin
  if new.parent_message_id is null then return new; end if;
  select conversation_id into v_parent from public.messages where id = new.parent_message_id;
  if v_parent is null or v_parent <> new.conversation_id then
    raise exception 'Parent/child messages must share conversation';
  end if;
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.generate_profile_update_token()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN encode(gen_random_bytes(32), 'hex');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_archived_items(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, archived_at timestamp with time zone, archive_type text, archive_data jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    am.id,
    am.archived_at,
    (am.archive_data->>'type')::TEXT AS archive_type,
    am.archive_data
  FROM public.archived_messages am
  WHERE am.user_id = v_user_id
  ORDER BY am.archived_at DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_conversation_messages(p_conversation_id uuid, p_limit integer DEFAULT 500)
 RETURNS TABLE(id uuid, conversation_id uuid, sender_id uuid, body text, created_at timestamp with time zone, parent_message_id uuid, sender_name text, sender_email text, flagged boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    m.id,
    m.conversation_id,
    m.sender_id,
    m.body,
    m.created_at,
    m.parent_message_id,
    p.first_name || ' ' || p.last_name AS sender_name,
    p.email AS sender_email,
    COALESCE(mus.flagged, false) as flagged
  FROM public.messages m
  JOIN public.profiles p ON p.id = m.sender_id
  LEFT JOIN public.message_user_state mus ON (
    mus.message_id = m.id AND mus.user_id = auth.uid()
  )
  WHERE m.conversation_id = p_conversation_id
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = p_conversation_id AND cm.user_id = auth.uid()
    )
  ORDER BY m.created_at DESC
  LIMIT p_limit;
$function$
;

CREATE OR REPLACE FUNCTION public.get_conversation_messages_with_state(p_conversation_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, conversation_id uuid, sender_id uuid, body text, created_at timestamp with time zone, parent_message_id uuid, sender_name text, sender_email text, read_at timestamp with time zone, flagged boolean, archived_at timestamp with time zone, is_sender boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    m.id,
    m.conversation_id,
    m.sender_id,
    m.body,
    m.created_at,
    m.parent_message_id,
    p.first_name || ' ' || p.last_name AS sender_name,
    p.email AS sender_email,
    NULL::TIMESTAMPTZ as read_at, -- Will be populated by frontend from read receipts
    COALESCE(mus.flagged, false) as flagged,
    mus.archived_at,
    m.sender_id = COALESCE(p_user_id, auth.uid()) as is_sender
  FROM public.messages m
  JOIN public.profiles p ON p.id = m.sender_id
  LEFT JOIN public.message_user_state mus ON (
    mus.message_id = m.id AND mus.user_id = COALESCE(p_user_id, auth.uid())
  )
  WHERE m.conversation_id = p_conversation_id
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = m.conversation_id
        AND cm.user_id = COALESCE(p_user_id, auth.uid())
    )
    AND (mus.archived_at IS NULL OR mus.user_id IS NULL)  -- Message not archived by user
  ORDER BY m.created_at ASC;
$function$
;

CREATE OR REPLACE FUNCTION public.get_conversation_summary(p_conversation_id uuid)
 RETURNS TABLE(last_message_body text, last_message_at timestamp with time zone, last_sender_name text, total_messages integer, unread_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH last_msg AS (
    SELECT
      m.body,
      m.created_at,
      p.first_name || ' ' || p.last_name AS sender_name
    FROM public.messages m
    JOIN public.profiles p ON p.id = m.sender_id
    WHERE m.conversation_id = p_conversation_id
      AND EXISTS (
        SELECT 1 FROM public.conversation_members cm
        WHERE cm.conversation_id = p_conversation_id
          AND cm.user_id = auth.uid()
      )
      AND (
        COALESCE((m.metadata ->> 'private_to')::UUID, '00000000-0000-0000-0000-000000000000'::UUID) = '00000000-0000-0000-0000-000000000000'::UUID
        OR (m.metadata ->> 'private_to')::UUID = auth.uid()
        OR m.sender_id = auth.uid()
        OR public.is_admin(auth.uid())
      )
    ORDER BY m.created_at DESC
    LIMIT 1
  ),
  totals AS (
    SELECT COUNT(*)::INT AS total_messages
    FROM public.messages m
    WHERE m.conversation_id = p_conversation_id
      AND EXISTS (
        SELECT 1 FROM public.conversation_members cm
        WHERE cm.conversation_id = p_conversation_id
          AND cm.user_id = auth.uid()
      )
      AND (
        COALESCE((m.metadata ->> 'private_to')::UUID, '00000000-0000-0000-0000-000000000000'::UUID) = '00000000-0000-0000-0000-000000000000'::UUID
        OR (m.metadata ->> 'private_to')::UUID = auth.uid()
        OR m.sender_id = auth.uid()
        OR public.is_admin(auth.uid())
      )
  ),
  unreads AS (
    SELECT COUNT(*)::INT AS unread_count
    FROM public.messages m
    LEFT JOIN public.message_read_receipts r ON r.message_id = m.id AND r.user_id = auth.uid()
    WHERE m.conversation_id = p_conversation_id
      AND m.sender_id <> auth.uid()
      AND r.id IS NULL
      AND EXISTS (
        SELECT 1 FROM public.conversation_members cm
        WHERE cm.conversation_id = p_conversation_id
          AND cm.user_id = auth.uid()
      )
      AND (
        COALESCE((m.metadata ->> 'private_to')::UUID, '00000000-0000-0000-0000-000000000000'::UUID) = '00000000-0000-0000-0000-000000000000'::UUID
        OR (m.metadata ->> 'private_to')::UUID = auth.uid()
        OR m.sender_id = auth.uid()
        OR public.is_admin(auth.uid())
      )
  )
  SELECT
    lm.body AS last_message_body,
    lm.created_at AS last_message_at,
    lm.sender_name AS last_sender_name,
    t.total_messages,
    u.unread_count
  FROM last_msg lm
  CROSS JOIN totals t
  CROSS JOIN unreads u;
$function$
;

CREATE OR REPLACE FUNCTION public.get_cron_job_runs(limit_count integer DEFAULT 50)
 RETURNS TABLE(runid bigint, jobid bigint, jobname text, job_pid integer, database text, username text, command text, status text, return_message text, start_time timestamp with time zone, end_time timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
begin
  return query
  select
    d.runid,
    d.jobid,
    j.jobname,
    d.job_pid,
    d.database,
    d.username,
    d.command,
    d.status,
    d.return_message,
    d.start_time,
    d.end_time
  from cron.job_run_details d
  join cron.job j on j.jobid = d.jobid
  order by d.start_time desc
  limit limit_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_cron_jobs()
 RETURNS TABLE(jobid bigint, jobname text, schedule text, command text, nodename text, nodeport integer, database text, username text, active boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
begin
  return query
  select
    j.jobid,
    j.jobname,
    j.schedule,
    j.command,
    j.nodename,
    j.nodeport,
    j.database,
    j.username,
    j.active
  from cron.job j
  order by j.jobname;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_message_read_status(p_message_ids bigint[])
 RETURNS TABLE(message_id bigint, read_count integer, readers jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_message_user_state(p_message_id uuid)
 RETURNS TABLE(flagged boolean, archived_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(mus.flagged, false) as flagged,
    mus.archived_at
  FROM public.message_user_state mus
  WHERE mus.message_id = p_message_id AND mus.user_id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.get_recurring_jobs_to_enqueue()
 RETURNS TABLE(id uuid, name text, task_type text, payload jsonb, schedule_interval_minutes integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    rj.id,
    rj.name,
    rj.task_type,
    rj.payload,
    rj.schedule_interval_minutes
  FROM recurring_jobs rj
  WHERE rj.enabled = true
    AND (
      rj.last_enqueued_at IS NULL
      OR rj.last_enqueued_at < now() - (rj.schedule_interval_minutes || ' minutes')::interval
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_thread_messages(p_thread_root_id uuid)
 RETURNS TABLE(id uuid, sender_id uuid, body text, created_at timestamp with time zone, parent_message_id uuid, sender_name text, sender_email text, flagged boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    m.id,
    m.sender_id,
    m.body,
    m.created_at,
    m.parent_message_id,
    p.first_name || ' ' || p.last_name AS sender_name,
    p.email AS sender_email,
    COALESCE(mus.flagged, false) as flagged
  FROM public.messages m
  JOIN public.profiles p ON p.id = m.sender_id
  LEFT JOIN public.message_user_state mus ON (
    mus.message_id = m.id AND mus.user_id = auth.uid()
  )
  WHERE (m.id = p_thread_root_id OR m.thread_root_id = p_thread_root_id)
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = (
        SELECT conversation_id FROM public.messages WHERE id = p_thread_root_id
      ) AND cm.user_id = auth.uid()
    )
  ORDER BY m.created_at ASC;
$function$
;

CREATE OR REPLACE FUNCTION public.get_unread_counts(p_user_id uuid DEFAULT auth.uid())
 RETURNS TABLE(conversation_id uuid, unread_count integer, last_message_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Only create profile for authenticated users
  IF NEW.email IS NOT NULL THEN
    -- Try to insert profile with Monday.com data from metadata, but don't fail if it already exists
    INSERT INTO public.profiles (
      id, 
      email, 
      role, 
      full_name,
      first_name, 
      last_name,
      school_name,
      mobile_number,
      division,
      region,
      monday_coach_id,
      is_approved,
      live_scan_completed,
      mandated_reporter_completed
    )
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'role', 'coach'),
      COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'fullName', ''),
      COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'school_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'mobile_number', ''),
      COALESCE(NEW.raw_user_meta_data->>'division', ''),
      COALESCE(NEW.raw_user_meta_data->>'region', ''),
      COALESCE(NEW.raw_user_meta_data->>'monday_coach_id', ''),
      COALESCE((NEW.raw_user_meta_data->>'is_approved')::boolean, true),
      COALESCE((NEW.raw_user_meta_data->>'live_scan_completed')::boolean, false),
      COALESCE((NEW.raw_user_meta_data->>'mandated_reporter_completed')::boolean, false)
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      role = EXCLUDED.role,
      full_name = EXCLUDED.full_name,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      school_name = EXCLUDED.school_name,
      mobile_number = EXCLUDED.mobile_number,
      division = EXCLUDED.division,
      region = EXCLUDED.region,
      monday_coach_id = EXCLUDED.monday_coach_id,
      is_approved = EXCLUDED.is_approved,
      live_scan_completed = EXCLUDED.live_scan_completed,
      mandated_reporter_completed = EXCLUDED.mandated_reporter_completed,
      updated_at = now();

    -- For coach users, try to link to existing coach record if it exists
    -- But don't fail if the coaches table is not accessible or coach doesn't exist
    IF COALESCE(NEW.raw_user_meta_data->>'role', 'coach') = 'coach' THEN
      BEGIN
        UPDATE public.coaches 
        SET auth_user_id = NEW.id, updated_at = now()
        WHERE email = NEW.email AND auth_user_id IS NULL;
      EXCEPTION 
        WHEN OTHERS THEN
          -- Log the error but don't fail the user creation
          RAISE WARNING 'Could not link coach record for %: %', NEW.email, SQLERRM;
      END;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the user creation
    RAISE WARNING 'Error in handle_new_user trigger for %: %', NEW.email, SQLERRM;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role = 'admin'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin_user()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Check if the current user has admin role in their profile
    -- Use SECURITY DEFINER to bypass RLS
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.job_queue_claim(p_limit integer DEFAULT 5)
 RETURNS SETOF job_queue
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_claimed_ids uuid[];
  v_recurring_ids uuid[];
  v_regular_ids uuid[];
  v_remaining_limit integer;
BEGIN
  -- First, claim recurring jobs that need to run
  WITH recurring_to_claim AS (
    SELECT id
    FROM job_queue
    WHERE is_recurring = true
      AND status = 'pending'
      AND (expires_at IS NULL OR expires_at > now())
      AND (
        (last_run_at IS NULL AND run_at <= now())
        OR (last_run_at IS NOT NULL AND last_run_at + (recurrence_interval_minutes || ' minutes')::interval <= now())
      )
    ORDER BY run_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ),
  updated_recurring AS (
    UPDATE job_queue
    SET
      run_at = CASE
        WHEN last_run_at IS NULL THEN run_at
        ELSE last_run_at + (recurrence_interval_minutes || ' minutes')::interval
      END,
      status = 'running',
      attempts = attempts + 1,
      updated_at = now()
    WHERE id IN (SELECT id FROM recurring_to_claim)
    RETURNING id
  )
  SELECT ARRAY_AGG(id) INTO v_recurring_ids FROM updated_recurring;

  -- Calculate remaining limit for regular jobs
  v_remaining_limit := p_limit - COALESCE(array_length(v_recurring_ids, 1), 0);

  -- If we didn't fill the limit with recurring jobs, claim regular jobs
  IF v_remaining_limit > 0 THEN
    WITH regular_to_claim AS (
      SELECT id
      FROM job_queue
      WHERE is_recurring = false
        AND status = 'pending'
        AND run_at <= now()
        AND id != ALL(COALESCE(v_recurring_ids, ARRAY[]::uuid[]))
      ORDER BY run_at
      LIMIT v_remaining_limit
      FOR UPDATE SKIP LOCKED
    ),
    updated_regular AS (
      UPDATE job_queue
      SET
        status = 'running',
        attempts = attempts + 1,
        updated_at = now()
      WHERE id IN (SELECT id FROM regular_to_claim)
      RETURNING id
    )
    SELECT ARRAY_AGG(id) INTO v_regular_ids FROM updated_regular;
  END IF;

  -- Combine all claimed IDs
  v_claimed_ids := COALESCE(v_recurring_ids, ARRAY[]::uuid[]) || COALESCE(v_regular_ids, ARRAY[]::uuid[]);

  -- Return all claimed jobs
  RETURN QUERY
  SELECT *
  FROM job_queue
  WHERE id = ANY(v_claimed_ids);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.job_queue_cleanup(p_max_age interval DEFAULT '14 days'::interval)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
declare
  deleted integer;
begin
  delete from public.job_queue
   where status in ('succeeded', 'cancelled')
     and coalesce(completed_at, updated_at, run_at) < now() - p_max_age
  returning 1 into deleted;
  return coalesce(deleted, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.job_queue_enqueue(p_task_type text, p_payload jsonb DEFAULT '{}'::jsonb, p_run_at timestamp with time zone DEFAULT now(), p_max_attempts integer DEFAULT 5)
 RETURNS job_queue
 LANGUAGE plpgsql
AS $function$
declare
  inserted job_queue;
begin
  insert into public.job_queue (task_type, payload, run_at, max_attempts)
  values (p_task_type, coalesce(p_payload, '{}'::jsonb), coalesce(p_run_at, now()), greatest(p_max_attempts, 1))
  returning * into inserted;
  return inserted;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.job_queue_health()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron', 'net', 'extensions'
AS $function$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'queueCounts', (
      select coalesce(jsonb_agg(jsonb_build_object('status', status, 'count', count)), '[]'::jsonb)
      from (
        select status, count(*) as count
        from public.job_queue
        group by status
      ) q
    ),
    'pendingQueueCount', (select count(*) from net.http_request_queue),
    'latestResponses', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'created', r.created,
        'status_code', r.status_code,
        'error', r.error_msg,
        'content', substring(r.content for 200)
      ) order by r.created desc), '[]'::jsonb)
      from (
        select * from net._http_response order by created desc limit 10
      ) r
    ),
    'latestRuns', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'jobname', sub.jobname,
        'start_time', sub.start_time,
        'end_time', sub.end_time,
        'status', sub.status,
        'message', sub.return_message
      ) order by sub.start_time desc), '[]'::jsonb)
      from (
        select
          d.start_time,
          d.end_time,
          d.status,
          d.return_message,
          j.jobname
        from cron.job_run_details d
        join cron.job j on j.jobid = d.jobid
        order by d.start_time desc
        limit 10
      ) sub
    )
  ) into result;

  return coalesce(result, '{}'::jsonb);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.job_queue_mark_failed(p_id uuid, p_error text, p_retry_in interval DEFAULT '00:05:00'::interval)
 RETURNS job_queue
 LANGUAGE plpgsql
AS $function$
declare
  updated job_queue;
  should_retry boolean;
begin
  select attempts < max_attempts into should_retry from public.job_queue where id = p_id;

  update public.job_queue
     set status = case when should_retry then 'pending' else 'failed' end,
         last_error = p_error,
         run_at = case when should_retry then now() + coalesce(p_retry_in, interval '5 minutes') else run_at end,
         completed_at = case when should_retry then completed_at else now() end,
         updated_at = now()
   where id = p_id
   returning * into updated;
  return updated;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.job_queue_mark_failed(p_job_id uuid, p_error text, p_retry_in_ms integer DEFAULT NULL::integer)
 RETURNS job_queue
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_job job_queue;
  v_should_retry boolean;
BEGIN
  SELECT * INTO v_job FROM job_queue WHERE id = p_job_id;

  -- Recurring jobs always retry (go back to pending)
  -- Regular jobs retry if they haven't hit max attempts and have a retry interval
  v_should_retry := v_job.is_recurring OR (v_job.attempts < v_job.max_attempts AND p_retry_in_ms IS NOT NULL);

  UPDATE job_queue
  SET
    status = CASE
      WHEN v_should_retry THEN 'pending'
      ELSE 'failed'
    END,
    run_at = CASE
      WHEN v_should_retry AND p_retry_in_ms IS NOT NULL THEN now() + (p_retry_in_ms || ' milliseconds')::interval
      WHEN v_should_retry AND v_job.is_recurring THEN last_run_at + (recurrence_interval_minutes || ' minutes')::interval
      ELSE run_at
    END,
    last_run_at = CASE
      WHEN v_job.is_recurring THEN now()
      ELSE NULL
    END,
    last_error = p_error,
    updated_at = now()
  WHERE id = p_job_id
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.job_queue_mark_succeeded(p_job_id uuid, p_output jsonb DEFAULT NULL::jsonb)
 RETURNS job_queue
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_job job_queue;
BEGIN
  UPDATE job_queue
  SET
    status = CASE
      WHEN is_recurring = true THEN 'pending'  -- Recurring jobs go back to pending
      ELSE 'succeeded'                          -- One-time jobs are done
    END,
    last_run_at = CASE
      WHEN is_recurring = true THEN now()      -- Track when recurring job last ran
      ELSE NULL
    END,
    output = p_output,
    last_error = NULL,
    updated_at = now()
  WHERE id = p_job_id
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.list_admins_minimal()
 RETURNS TABLE(id uuid, first_name text, last_name text, email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.first_name, p.last_name, p.email
  from public.profiles p
  where p.role = 'admin';
$function$
;

CREATE OR REPLACE FUNCTION public.list_coaches_minimal()
 RETURNS TABLE(id uuid, first_name text, last_name text, email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.first_name, p.last_name, p.email
  from public.profiles p
  where p.role = 'coach';
$function$
;

CREATE OR REPLACE FUNCTION public.list_conversations_enriched(p_user_id uuid)
 RETURNS TABLE(id uuid, type text, title text, created_by uuid, created_at timestamp with time zone, unread_count integer, last_message_at timestamp with time zone, display_title text, archived_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.list_conversations_with_unread(p_user_id uuid)
 RETURNS TABLE(id uuid, type text, title text, created_by uuid, created_at timestamp with time zone, unread_count integer, last_message_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.list_conversations_with_user_state(p_user_id uuid)
 RETURNS TABLE(id uuid, type text, title text, created_by uuid, created_at timestamp with time zone, unread_count integer, last_message_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT c.id, c.type, c.title, c.created_by, c.created_at,
           cm.last_read_at
    FROM public.conversations c
    JOIN public.conversation_members cm ON cm.conversation_id = c.id
    WHERE cm.user_id = p_user_id
  ),
  counts AS (
    SELECT b.id, count(m.id)::int as unread_count,
           max(m.created_at) as last_message_at
    FROM base b
    LEFT JOIN public.messages m
      ON m.conversation_id = b.id
     AND m.created_at > b.last_read_at
     AND m.sender_id <> p_user_id
    GROUP BY b.id
  )
  SELECT b.id, b.type, b.title, b.created_by, b.created_at,
         COALESCE(c.unread_count, 0) as unread_count,
         c.last_message_at
  FROM base b
  LEFT JOIN counts c ON c.id = b.id
  ORDER BY COALESCE(c.last_message_at, b.created_at) DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.list_members_with_profile(p_conversation_id uuid)
 RETURNS TABLE(user_id uuid, first_name text, last_name text, email text, role text, joined_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select v.user_id, v.first_name, v.last_name, v.email, cm.role, cm.joined_at
  from public.conversation_members cm
  join public.v_conversation_members_with_profile v
    on v.conversation_id = cm.conversation_id and v.user_id = cm.user_id
  where cm.conversation_id = p_conversation_id
    and exists (
      select 1 from public.conversation_members self
      where self.conversation_id = p_conversation_id and self.user_id = auth.uid()
    );
$function$
;

CREATE OR REPLACE FUNCTION public.list_messages_with_sender(p_conversation_id uuid, p_limit integer DEFAULT 200)
 RETURNS TABLE(id bigint, conversation_id uuid, sender_id uuid, body text, created_at timestamp with time zone, first_name text, last_name text, email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select v.id, v.conversation_id, v.sender_id, v.body, v.created_at, v.first_name, v.last_name, v.email
  from public.v_messages_with_sender v
  where v.conversation_id = p_conversation_id
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = p_conversation_id and cm.user_id = auth.uid()
    )
  order by v.created_at asc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$function$
;

CREATE OR REPLACE FUNCTION public.list_messages_with_sender_v2(p_conversation_id uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(id bigint, conversation_id uuid, sender_id uuid, subject text, body text, metadata jsonb, created_at timestamp with time zone, parent_message_id bigint, sender_first_name text, sender_last_name text, sender_email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    m.id,
    m.conversation_id,
    m.sender_id,
    m.subject,
    m.body,
    m.metadata,
    m.created_at,
    m.parent_message_id,
    p.first_name AS sender_first_name,
    p.last_name AS sender_last_name,
    p.email AS sender_email
  FROM public.messages m
  JOIN public.profiles p ON p.id = m.sender_id
  WHERE m.conversation_id = p_conversation_id
    AND (
      -- User is admin (sees all)
      public.is_admin(auth.uid())
      -- User is member of conversation
      OR EXISTS (
        SELECT 1 FROM public.conversation_members cm
        WHERE cm.conversation_id = m.conversation_id
          AND cm.user_id = auth.uid()
      )
    )
  ORDER BY m.created_at DESC
  LIMIT p_limit;
$function$
;

CREATE OR REPLACE FUNCTION public.list_threads(p_conversation_id uuid, p_limit integer DEFAULT 200)
 RETURNS TABLE(root_id bigint, sender_id uuid, created_at timestamp with time zone, snippet text, reply_count integer, last_reply_at timestamp with time zone, read_count integer, unread_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with roots as (
    select m.id as root_id,
           m.sender_id,
           m.created_at,
           m.body,
           coalesce(m.thread_reply_count, 0) as reply_count,
           m.thread_last_reply_at
    from public.messages m
    where m.conversation_id = p_conversation_id
      and m.parent_message_id is null
  ),
  reads as (
    select r.message_id, count(*)::int as read_count
    from public.message_read_receipts r
    join roots rt on rt.root_id = r.message_id
    group by r.message_id
  ),
  unreads as (
    select rt.root_id,
           count(m.id)::int as unread_count
    from roots rt
    join public.messages m on (m.id = rt.root_id or m.thread_root_id = rt.root_id)
    left join public.message_read_receipts r on r.message_id = m.id and r.user_id = auth.uid()
    where m.sender_id <> auth.uid() and r.id is null
    group by rt.root_id
  )
  select 
    rt.root_id,
    rt.sender_id,
    rt.created_at,
    left(regexp_replace(rt.body, '\n+', ' ', 'g'), 160) as snippet,
    rt.reply_count,
    rt.thread_last_reply_at as last_reply_at,
    coalesce(rd.read_count, 0) as read_count,
    coalesce(uw.unread_count, 0) as unread_count
  from roots rt
  left join reads rd on rd.message_id = rt.root_id
  left join unreads uw on uw.root_id = rt.root_id
  order by coalesce(rt.thread_last_reply_at, rt.created_at) desc
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
$function$
;

CREATE OR REPLACE FUNCTION public.list_users_minimal()
 RETURNS TABLE(id uuid, first_name text, last_name text, email text, role text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.first_name, p.last_name, p.email, p.role
  from public.profiles p
  where p.role in ('admin','coach');
$function$
;

CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.conversation_members cm
     set last_read_at = greatest(
       cm.last_read_at,
       coalesce((select max(m.created_at) from public.messages m where m.conversation_id = p_conversation_id), now())
     )
   where cm.conversation_id = p_conversation_id
     and cm.user_id = auth.uid();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_conversation_read_v2(p_conversation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_ts timestamptz; begin
  select max(created_at) into v_ts from public.messages where conversation_id = p_conversation_id;
  update public.conversation_members cm
     set last_read_at = greatest(coalesce(v_ts, now()), cm.last_read_at)
   where cm.conversation_id = p_conversation_id and cm.user_id = auth.uid();
end; $function$
;

CREATE OR REPLACE FUNCTION public.mark_messages_read(p_message_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count INT;
BEGIN
  INSERT INTO public.message_read_receipts (message_id, user_id)
  SELECT unnest(p_message_ids), auth.uid()
  ON CONFLICT (message_id, user_id) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_recurring_job_enqueued(job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE recurring_jobs
  SET last_enqueued_at = now(),
      updated_at = now()
  WHERE id = job_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.post_private_reply(p_conversation_id uuid, p_body text, p_recipient uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id bigint;
  v_sender uuid := auth.uid();
  v_type text;
begin
  if v_sender is null then raise exception 'Unauthorized'; end if;
  if p_body is null or length(trim(p_body)) = 0 then raise exception 'Body required'; end if;
  select type into v_type from public.conversations where id = p_conversation_id;
  if v_type is distinct from 'announcement' then raise exception 'Private replies are only supported in announcements'; end if;
  -- ensure membership
  if not exists (select 1 from public.conversation_members cm where cm.conversation_id = p_conversation_id and cm.user_id = v_sender) then
    raise exception 'Not a member of conversation';
  end if;

  insert into public.messages (conversation_id, sender_id, body, metadata)
  values (p_conversation_id, v_sender, p_body, jsonb_build_object('private_to', p_recipient))
  returning id into v_id;
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.post_private_reply(p_conversation_id uuid, p_body text, p_recipient uuid, p_parent_message_id bigint DEFAULT NULL::bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id bigint;
  v_sender uuid := auth.uid();
  v_type text;
begin
  if v_sender is null then raise exception 'Unauthorized'; end if;
  if p_body is null or length(trim(p_body)) = 0 then raise exception 'Body required'; end if;
  select type into v_type from public.conversations where id = p_conversation_id;
  if v_type is distinct from 'announcement' then raise exception 'Private replies are only supported in announcements'; end if;
  -- ensure membership
  if not exists (select 1 from public.conversation_members cm where cm.conversation_id = p_conversation_id and cm.user_id = v_sender) then
    raise exception 'Not a member of conversation';
  end if;

  -- Optional: verify parent message (if provided) belongs to the same conversation
  if p_parent_message_id is not null then
    if not exists (
      select 1 from public.messages pm
      where pm.id = p_parent_message_id and pm.conversation_id = p_conversation_id
    ) then
      raise exception 'Parent/child messages must share conversation';
    end if;
  end if;

  insert into public.messages (conversation_id, sender_id, body, metadata, parent_message_id)
  values (p_conversation_id, v_sender, p_body, jsonb_build_object('private_to', p_recipient), p_parent_message_id)
  returning id into v_id;
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.recompute_thread_roots(p_conversation_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  v_root bigint;
begin
  for r in
    select m.id, m.parent_message_id
    from public.messages m
    where m.parent_message_id is not null
      and (p_conversation_id is null or m.conversation_id = p_conversation_id)
  loop
    -- find root: if parent has thread_root_id use it else use parent id
    select coalesce(pm.thread_root_id, pm.id)
      into v_root
    from public.messages pm
    where pm.id = r.parent_message_id;

    update public.messages set thread_root_id = v_root where id = r.id and (thread_root_id is null or thread_root_id <> v_root);
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.recompute_thread_stats(p_conversation_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with roots as (
    select distinct coalesce(m.thread_root_id, m.id) as rid
    from public.messages m
    where (p_conversation_id is null or m.conversation_id = p_conversation_id)
      and (m.parent_message_id is not null or exists (
            select 1 from public.messages c where c.parent_message_id = m.id))
  ), agg as (
    select r.rid,
           count(c.id)::int as reply_count,
           max(c.created_at) as last_reply_at
    from roots r
    left join public.messages c on c.thread_root_id = r.rid
    group by r.rid
  )
  update public.messages m
     set thread_reply_count = coalesce(a.reply_count, 0),
         thread_last_reply_at = a.last_reply_at
    from agg a
   where m.id = a.rid;
$function$
;

CREATE OR REPLACE FUNCTION public.set_job_queue_settings_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_job_queue_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_profile_update_token_with_expiry()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.profile_update_token := generate_profile_update_token();
    NEW.profile_update_token_expires := NOW() + INTERVAL '7 days';
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.toggle_cron_job(job_name text, new_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
begin
  update cron.job
  set active = new_active
  where jobname = job_name;

  if not found then
    raise exception 'Cron job not found: %', job_name;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.toggle_message_flag(p_message_id uuid, p_flagged boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Verify user has access to the message
  IF NOT EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
    WHERE m.id = p_message_id AND cm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: User is not a member of this conversation';
  END IF;

  -- Upsert the flag state
  INSERT INTO public.message_user_state (user_id, message_id, flagged)
  VALUES (auth.uid(), p_message_id, p_flagged)
  ON CONFLICT (user_id, message_id)
  DO UPDATE SET flagged = p_flagged, updated_at = NOW();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.unarchive_message_user(p_message_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Verify user has access to the message
  IF NOT EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
    WHERE m.id = p_message_id AND cm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: User is not a member of this conversation';
  END IF;

  -- Unarchive the message for this user only
  UPDATE public.message_user_state
  SET archived_at = NULL, updated_at = NOW()
  WHERE user_id = auth.uid() AND message_id = p_message_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_cron_schedule(job_name text, new_schedule text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
declare
  job_id bigint;
begin
  -- Get the job id
  select jobid into job_id
  from cron.job
  where jobname = job_name;

  if not found then
    raise exception 'Cron job not found: %', job_name;
  end if;

  -- Use cron.alter_job to update the schedule
  perform cron.alter_job(
    job_id := job_id,
    schedule := new_schedule
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_game_platform_sync_state_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_message_user_state_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_thread_stats()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
end; $function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

