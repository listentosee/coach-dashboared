


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'Removed restore_archived_item: orphaned (0 callers)';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "wrappers" WITH SCHEMA "extensions";






CREATE TYPE "public"."competitor_division" AS ENUM (
    'middle_school',
    'high_school',
    'college'
);


ALTER TYPE "public"."competitor_division" OWNER TO "postgres";


CREATE TYPE "public"."completion_source" AS ENUM (
    'zoho',
    'manual'
);


ALTER TYPE "public"."completion_source" OWNER TO "postgres";


CREATE TYPE "public"."metactf_role" AS ENUM (
    'coach',
    'user'
);


ALTER TYPE "public"."metactf_role" OWNER TO "postgres";


CREATE TYPE "public"."metactf_sync_status" AS ENUM (
    'pending',
    'user_created',
    'approved',
    'denied',
    'error'
);


ALTER TYPE "public"."metactf_sync_status" OWNER TO "postgres";


CREATE TYPE "public"."team_status" AS ENUM (
    'forming',
    'active',
    'archived'
);


ALTER TYPE "public"."team_status" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'admin',
    'coach'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."archive_all_messages_in_conversation"("p_conversation_id" "uuid", "p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."archive_all_messages_in_conversation"("p_conversation_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."archive_message_user"("p_message_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."archive_message_user"("p_message_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."archive_message_user"("p_message_id" "uuid") IS 'Soft-archive a message for current user (hides but doesn''t delete)';



CREATE OR REPLACE FUNCTION "public"."check_team_size"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF (SELECT COUNT(*) FROM team_members WHERE team_id = NEW.team_id) >= 6 THEN
        RAISE EXCEPTION 'Team cannot have more than 6 members';
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_team_size"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_unread_by_receipts"("p_user_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."count_unread_by_receipts"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_unread_messages"("p_user_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."count_unread_messages"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_announcement_and_broadcast"("p_body" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."create_announcement_and_broadcast"("p_body" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_announcement_and_broadcast"("p_title" "text", "p_body" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."create_announcement_and_broadcast"("p_title" "text", "p_body" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_cron_job"("job_name" "text", "job_schedule" "text", "task_type" "text", "task_payload" "jsonb" DEFAULT '{}'::"jsonb", "max_attempts" integer DEFAULT 3) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'cron'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."create_cron_job"("job_name" "text", "job_schedule" "text", "task_type" "text", "task_payload" "jsonb", "max_attempts" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_dm_conversation"("p_other_user_id" "uuid", "p_title" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."create_dm_conversation"("p_other_user_id" "uuid", "p_title" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_group_conversation"("p_user_ids" "uuid"[], "p_title" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."create_group_conversation"("p_user_ids" "uuid"[], "p_title" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_or_get_dm"("p_other_user_id" "uuid", "p_title" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."create_or_get_dm"("p_other_user_id" "uuid", "p_title" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_same_conversation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare v_parent uuid; begin
  if new.parent_message_id is null then return new; end if;
  select conversation_id into v_parent from public.messages where id = new.parent_message_id;
  if v_parent is null or v_parent <> new.conversation_id then
    raise exception 'Parent/child messages must share conversation';
  end if;
  return new;
end; $$;


ALTER FUNCTION "public"."enforce_same_conversation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fetch_unread_alert_candidates"("p_window_minutes" integer DEFAULT 1440, "p_coach_id" "uuid" DEFAULT NULL::"uuid", "p_force" boolean DEFAULT false, "p_roles" "text"[] DEFAULT ARRAY['coach'::"text"]) RETURNS TABLE("coach_id" "uuid", "email" "text", "full_name" "text", "first_name" "text", "mobile_number" "text", "unread_count" integer, "email_alerts_enabled" boolean, "email_alert_address" "text", "sms_notifications_enabled" boolean, "last_unread_alert_at" timestamp with time zone, "last_unread_alert_count" integer)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  WITH unread AS (
    SELECT
      p.id AS coach_id,
      p.email,
      p.full_name,
      p.first_name,
      p.mobile_number,
      COALESCE(count_unread_by_receipts(p.id), count_unread_messages(p.id)) AS unread_count,
      p.email_alerts_enabled,
      p.email_alert_address,
      p.sms_notifications_enabled,
      p.last_unread_alert_at,
      p.last_unread_alert_count
    FROM public.profiles p
    WHERE (
      p_roles IS NULL
      OR array_length(p_roles, 1) IS NULL
      OR p.role::text = ANY(p_roles)
    )
      AND (p_coach_id IS NULL OR p.id = p_coach_id)
  )
  SELECT *
  FROM unread
  WHERE unread_count > 0
    AND (
      p_force
      OR last_unread_alert_at IS NULL
      OR last_unread_alert_count IS NULL
      OR unread_count > last_unread_alert_count
      OR last_unread_alert_at < now() - make_interval(mins => COALESCE(p_window_minutes, 1440))
    )
  ORDER BY unread_count DESC;
$$;


ALTER FUNCTION "public"."fetch_unread_alert_candidates"("p_window_minutes" integer, "p_coach_id" "uuid", "p_force" boolean, "p_roles" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_profile_update_token"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN encode(gen_random_bytes(32), 'hex');
END;
$$;


ALTER FUNCTION "public"."generate_profile_update_token"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_archived_items"("p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("id" "uuid", "archived_at" timestamp with time zone, "archive_type" "text", "archive_data" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."get_archived_items"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_conversation_messages"("p_conversation_id" "uuid", "p_limit" integer DEFAULT 500) RETURNS TABLE("id" "uuid", "conversation_id" "uuid", "sender_id" "uuid", "body" "text", "created_at" timestamp with time zone, "parent_message_id" "uuid", "sender_name" "text", "sender_email" "text", "flagged" boolean, "high_priority" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    m.id,
    m.conversation_id,
    m.sender_id,
    m.body,
    m.created_at,
    m.parent_message_id,
    p.first_name || ' ' || p.last_name AS sender_name,
    p.email AS sender_email,
    COALESCE(mus.flagged, false) as flagged,
    m.high_priority
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
$$;


ALTER FUNCTION "public"."get_conversation_messages"("p_conversation_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_conversation_messages_with_state"("p_conversation_id" "uuid", "p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("id" "uuid", "conversation_id" "uuid", "sender_id" "uuid", "body" "text", "created_at" timestamp with time zone, "parent_message_id" "uuid", "sender_name" "text", "sender_email" "text", "read_at" timestamp with time zone, "flagged" boolean, "archived_at" timestamp with time zone, "is_sender" boolean, "high_priority" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    m.id,
    m.conversation_id,
    m.sender_id,
    m.body,
    m.created_at,
    m.parent_message_id,
    p.first_name || ' ' || p.last_name AS sender_name,
    p.email AS sender_email,
    NULL::TIMESTAMPTZ as read_at,
    COALESCE(mus.flagged, false) as flagged,
    mus.archived_at,
    m.sender_id = COALESCE(p_user_id, auth.uid()) as is_sender,
    m.high_priority
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
    AND (mus.archived_at IS NULL OR mus.user_id IS NULL)
  ORDER BY m.created_at ASC;
$$;


ALTER FUNCTION "public"."get_conversation_messages_with_state"("p_conversation_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_conversation_summary"("p_conversation_id" "uuid") RETURNS TABLE("last_message_body" "text", "last_message_at" timestamp with time zone, "last_sender_name" "text", "total_messages" integer, "unread_count" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."get_conversation_summary"("p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_cron_job_runs"("limit_count" integer DEFAULT 50) RETURNS TABLE("runid" bigint, "jobid" bigint, "jobname" "text", "job_pid" integer, "database" "text", "username" "text", "command" "text", "status" "text", "return_message" "text", "start_time" timestamp with time zone, "end_time" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'cron'
    AS $$
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
$$;


ALTER FUNCTION "public"."get_cron_job_runs"("limit_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_cron_jobs"() RETURNS TABLE("jobid" bigint, "jobname" "text", "schedule" "text", "command" "text", "nodename" "text", "nodeport" integer, "database" "text", "username" "text", "active" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'cron'
    AS $$
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
$$;


ALTER FUNCTION "public"."get_cron_jobs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_dashboard_category_totals"("p_synced_user_ids" "text"[]) RETURNS TABLE("synced_user_id" "text", "challenge_category" "text", "challenges" integer, "points" integer)
    LANGUAGE "sql"
    AS $$
  SELECT
    synced_user_id,
    COALESCE(challenge_category, 'Uncategorized') AS challenge_category,
    COUNT(*)::int AS challenges,
    COALESCE(SUM(challenge_points), 0)::int AS points
  FROM public.game_platform_challenge_solves
  WHERE synced_user_id = ANY(p_synced_user_ids)
  GROUP BY synced_user_id, COALESCE(challenge_category, 'Uncategorized');
$$;


ALTER FUNCTION "public"."get_dashboard_category_totals"("p_synced_user_ids" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_message_read_status"("p_message_ids" bigint[]) RETURNS TABLE("message_id" bigint, "read_count" integer, "readers" "jsonb")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."get_message_read_status"("p_message_ids" bigint[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_message_user_state"("p_message_id" "uuid") RETURNS TABLE("flagged" boolean, "archived_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    COALESCE(mus.flagged, false) as flagged,
    mus.archived_at
  FROM public.message_user_state mus
  WHERE mus.message_id = p_message_id AND mus.user_id = auth.uid();
$$;


ALTER FUNCTION "public"."get_message_user_state"("p_message_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_message_user_state"("p_message_id" "uuid") IS 'Get current user''s state for a specific message (flagged, archived)';



CREATE OR REPLACE FUNCTION "public"."get_recent_messages_for_user"("p_user_id" "uuid", "p_limit_per_conversation" integer DEFAULT 50) RETURNS TABLE("id" "uuid", "conversation_id" "uuid", "sender_id" "uuid", "body" "text", "created_at" timestamp with time zone, "parent_message_id" "uuid", "sender_name" "text", "sender_email" "text", "flagged" boolean, "archived_at" timestamp with time zone, "high_priority" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with convs as (
    select c.id
    from public.conversations c
    join public.conversation_members cm on cm.conversation_id = c.id
    where cm.user_id = p_user_id
  )
  select
    m.id,
    m.conversation_id,
    m.sender_id,
    m.body,
    m.created_at,
    m.parent_message_id,
    p.first_name || ' ' || p.last_name as sender_name,
    p.email as sender_email,
    coalesce(m.flagged, false) as flagged,
    m.archived_at,
    m.high_priority
  from convs c
  join lateral (
    select m.*, mus.flagged, mus.archived_at
    from public.messages m
    left join public.message_user_state mus
      on mus.message_id = m.id and mus.user_id = p_user_id
    where m.conversation_id = c.id
      and (mus.archived_at is null or mus.user_id is null)
    order by m.created_at desc
    limit least(greatest(coalesce(p_limit_per_conversation, 50), 1), 200)
  ) m on true
  join public.profiles p on p.id = m.sender_id;
$$;


ALTER FUNCTION "public"."get_recent_messages_for_user"("p_user_id" "uuid", "p_limit_per_conversation" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_recurring_jobs_to_enqueue"() RETURNS TABLE("id" "uuid", "name" "text", "task_type" "text", "payload" "jsonb", "schedule_interval_minutes" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."get_recurring_jobs_to_enqueue"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_thread_messages"("p_thread_root_id" "uuid") RETURNS TABLE("id" "uuid", "sender_id" "uuid", "body" "text", "created_at" timestamp with time zone, "parent_message_id" "uuid", "sender_name" "text", "sender_email" "text", "flagged" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
  WHERE (m.id = p_thread_root_id OR m.thread_root_id = p_thread_root_id OR m.parent_message_id = p_thread_root_id)
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = (
        SELECT conversation_id FROM public.messages WHERE id = p_thread_root_id
      ) AND cm.user_id = auth.uid()
    )
  ORDER BY m.created_at ASC;
$$;


ALTER FUNCTION "public"."get_thread_messages"("p_thread_root_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_unread_counts"("p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS TABLE("conversation_id" "uuid", "unread_count" integer, "last_message_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."get_unread_counts"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."handle_new_user"() IS 'Automatically creates profile records with Monday.com data when new users sign up';



CREATE OR REPLACE FUNCTION "public"."is_admin"("uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"("uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_user"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Check if the current user has admin role in their profile
    -- Use SECURITY DEFINER to bypass RLS
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$;


ALTER FUNCTION "public"."is_admin_user"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."job_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "run_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 5 NOT NULL,
    "last_error" "text",
    "output" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "is_recurring" boolean DEFAULT false NOT NULL,
    "recurrence_interval_minutes" integer,
    "expires_at" timestamp with time zone,
    "last_run_at" timestamp with time zone,
    CONSTRAINT "job_queue_attempts_check" CHECK ((("attempts" >= 0) AND ("max_attempts" >= 1))),
    CONSTRAINT "job_queue_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'running'::"text", 'succeeded'::"text", 'failed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "recurring_jobs_must_have_interval" CHECK (((("is_recurring" = false) AND ("recurrence_interval_minutes" IS NULL)) OR (("is_recurring" = true) AND ("recurrence_interval_minutes" > 0))))
);


ALTER TABLE "public"."job_queue" OWNER TO "postgres";


COMMENT ON COLUMN "public"."job_queue"."is_recurring" IS 'If true, this job runs repeatedly on a schedule';



COMMENT ON COLUMN "public"."job_queue"."recurrence_interval_minutes" IS 'How often recurring jobs should run (required if is_recurring = true)';



COMMENT ON COLUMN "public"."job_queue"."expires_at" IS 'When a recurring job should stop running (NULL = forever)';



COMMENT ON COLUMN "public"."job_queue"."last_run_at" IS 'When a recurring job last completed (used to calculate next run time)';



CREATE OR REPLACE FUNCTION "public"."job_queue_claim"("p_limit" integer DEFAULT 5) RETURNS SETOF "public"."job_queue"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."job_queue_claim"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."job_queue_cleanup"("p_max_age" interval DEFAULT '14 days'::interval) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
declare
  deleted integer;
begin
  delete from public.job_queue
   where status in ('succeeded', 'cancelled')
     and coalesce(completed_at, updated_at, run_at) < now() - p_max_age
  returning 1 into deleted;
  return coalesce(deleted, 0);
end;
$$;


ALTER FUNCTION "public"."job_queue_cleanup"("p_max_age" interval) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."job_queue_enqueue"("p_task_type" "text", "p_payload" "jsonb" DEFAULT '{}'::"jsonb", "p_run_at" timestamp with time zone DEFAULT "now"(), "p_max_attempts" integer DEFAULT 5) RETURNS "public"."job_queue"
    LANGUAGE "plpgsql"
    AS $$
declare
  inserted job_queue;
begin
  insert into public.job_queue (task_type, payload, run_at, max_attempts)
  values (p_task_type, coalesce(p_payload, '{}'::jsonb), coalesce(p_run_at, now()), greatest(p_max_attempts, 1))
  returning * into inserted;
  return inserted;
end;
$$;


ALTER FUNCTION "public"."job_queue_enqueue"("p_task_type" "text", "p_payload" "jsonb", "p_run_at" timestamp with time zone, "p_max_attempts" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."job_queue_health"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'cron', 'net', 'extensions'
    AS $$
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
$$;


ALTER FUNCTION "public"."job_queue_health"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."job_queue_mark_failed"("p_job_id" "uuid", "p_error" "text", "p_retry_in_ms" integer DEFAULT NULL::integer) RETURNS "public"."job_queue"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."job_queue_mark_failed"("p_job_id" "uuid", "p_error" "text", "p_retry_in_ms" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."job_queue_mark_failed"("p_id" "uuid", "p_error" "text", "p_retry_in" interval DEFAULT '00:05:00'::interval) RETURNS "public"."job_queue"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."job_queue_mark_failed"("p_id" "uuid", "p_error" "text", "p_retry_in" interval) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."job_queue_mark_succeeded"("p_job_id" "uuid", "p_output" "jsonb" DEFAULT NULL::"jsonb") RETURNS "public"."job_queue"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."job_queue_mark_succeeded"("p_job_id" "uuid", "p_output" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_admins_minimal"() RETURNS TABLE("id" "uuid", "first_name" "text", "last_name" "text", "email" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p.id, p.first_name, p.last_name, p.email
  from public.profiles p
  where p.role = 'admin';
$$;


ALTER FUNCTION "public"."list_admins_minimal"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_coaches_minimal"() RETURNS TABLE("id" "uuid", "first_name" "text", "last_name" "text", "email" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p.id, p.first_name, p.last_name, p.email
  from public.profiles p
  where p.role = 'coach';
$$;


ALTER FUNCTION "public"."list_coaches_minimal"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_conversations_enriched"("p_user_id" "uuid") RETURNS TABLE("id" "uuid", "type" "text", "title" "text", "created_by" "uuid", "created_at" timestamp with time zone, "unread_count" integer, "last_message_at" timestamp with time zone, "display_title" "text", "archived_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."list_conversations_enriched"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_conversations_summary"("p_user_id" "uuid") RETURNS TABLE("id" "uuid", "type" "text", "title" "text", "created_by" "uuid", "created_at" timestamp with time zone, "unread_count" integer, "last_message_at" timestamp with time zone, "display_title" "text", "last_message_body" "text", "last_sender_name" "text", "last_sender_email" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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
  last_msg as (
    select b.id as conversation_id,
           lm.id as message_id,
           lm.body as last_message_body,
           lm.sender_id as last_sender_id,
           lm.created_at as last_message_at
    from base b
    left join lateral (
      select m.id, m.body, m.sender_id, m.created_at
      from public.messages m
      where m.conversation_id = b.id
      order by m.created_at desc
      limit 1
    ) lm on true
  )
  select
    b.id,
    b.type,
    b.title,
    b.created_by,
    b.created_at,
    coalesce(c.unread_count, 0) as unread_count,
    coalesce(lm.last_message_at, c.last_message_at) as last_message_at,
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
    lm.last_message_body,
    (p.first_name || ' ' || p.last_name) as last_sender_name,
    p.email as last_sender_email
  from base b
  left join counts c on c.id = b.id
  left join last_msg lm on lm.conversation_id = b.id
  left join public.profiles p on p.id = lm.last_sender_id;
$$;


ALTER FUNCTION "public"."list_conversations_summary"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_conversations_with_unread"("p_user_id" "uuid") RETURNS TABLE("id" "uuid", "type" "text", "title" "text", "created_by" "uuid", "created_at" timestamp with time zone, "unread_count" integer, "last_message_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."list_conversations_with_unread"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_conversations_with_user_state"("p_user_id" "uuid") RETURNS TABLE("id" "uuid", "type" "text", "title" "text", "created_by" "uuid", "created_at" timestamp with time zone, "unread_count" integer, "last_message_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."list_conversations_with_user_state"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."list_conversations_with_user_state"("p_user_id" "uuid") IS 'List conversations with per-user state (archives, unread counts)';



CREATE OR REPLACE FUNCTION "public"."list_members_with_profile"("p_conversation_id" "uuid") RETURNS TABLE("user_id" "uuid", "first_name" "text", "last_name" "text", "email" "text", "role" "text", "joined_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."list_members_with_profile"("p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_messages_with_sender"("p_conversation_id" "uuid", "p_limit" integer DEFAULT 200) RETURNS TABLE("id" bigint, "conversation_id" "uuid", "sender_id" "uuid", "body" "text", "created_at" timestamp with time zone, "first_name" "text", "last_name" "text", "email" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."list_messages_with_sender"("p_conversation_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_messages_with_sender_v2"("p_conversation_id" "uuid", "p_limit" integer DEFAULT 50) RETURNS TABLE("id" bigint, "conversation_id" "uuid", "sender_id" "uuid", "subject" "text", "body" "text", "metadata" "jsonb", "created_at" timestamp with time zone, "parent_message_id" bigint, "sender_first_name" "text", "sender_last_name" "text", "sender_email" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."list_messages_with_sender_v2"("p_conversation_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_threads"("p_conversation_id" "uuid", "p_limit" integer DEFAULT 200) RETURNS TABLE("root_id" bigint, "sender_id" "uuid", "created_at" timestamp with time zone, "snippet" "text", "reply_count" integer, "last_reply_at" timestamp with time zone, "read_count" integer, "unread_count" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."list_threads"("p_conversation_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_threads_for_user"("p_user_id" "uuid", "p_limit" integer DEFAULT 500) RETURNS TABLE("conversation_id" "uuid", "root_id" "uuid", "sender_id" "uuid", "created_at" timestamp with time zone, "snippet" "text", "reply_count" integer, "last_reply_at" timestamp with time zone, "unread_count" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with memberships as (
    select cm.conversation_id
    from public.conversation_members cm
    where cm.user_id = p_user_id
  ),
  roots as (
    select m.id as root_id,
           m.conversation_id,
           m.sender_id,
           m.created_at,
           m.body,
           coalesce(m.thread_reply_count, 0) as reply_count,
           m.thread_last_reply_at
    from public.messages m
    join memberships ms on ms.conversation_id = m.conversation_id
    where m.parent_message_id is null
  ),
  unreads as (
    select rt.root_id,
           count(m.id)::int as unread_count
    from roots rt
    join public.messages m on (m.id = rt.root_id or m.thread_root_id = rt.root_id)
    left join public.message_read_receipts r on r.message_id = m.id and r.user_id = p_user_id
    where m.sender_id <> p_user_id and r.id is null
    group by rt.root_id
  )
  select
    rt.conversation_id,
    rt.root_id,
    rt.sender_id,
    rt.created_at,
    left(regexp_replace(rt.body, '\n+', ' ', 'g'), 160) as snippet,
    rt.reply_count,
    rt.thread_last_reply_at as last_reply_at,
    coalesce(uw.unread_count, 0) as unread_count
  from roots rt
  left join unreads uw on uw.root_id = rt.root_id
  order by coalesce(rt.thread_last_reply_at, rt.created_at) desc
  limit least(greatest(coalesce(p_limit, 500), 1), 2000);
$$;


ALTER FUNCTION "public"."list_threads_for_user"("p_user_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_users_minimal"() RETURNS TABLE("id" "uuid", "first_name" "text", "last_name" "text", "email" "text", "role" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p.id, p.first_name, p.last_name, p.email, p.role
  from public.profiles p
  where p.role in ('admin','coach');
$$;


ALTER FUNCTION "public"."list_users_minimal"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_conversation_read"("p_conversation_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."mark_conversation_read"("p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_conversation_read_v2"("p_conversation_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_ts timestamptz; begin
  select max(created_at) into v_ts from public.messages where conversation_id = p_conversation_id;
  update public.conversation_members cm
     set last_read_at = greatest(coalesce(v_ts, now()), cm.last_read_at)
   where cm.conversation_id = p_conversation_id and cm.user_id = auth.uid();
end; $$;


ALTER FUNCTION "public"."mark_conversation_read_v2"("p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_messages_read"("p_message_ids" "uuid"[]) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."mark_messages_read"("p_message_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_recurring_job_enqueued"("job_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE recurring_jobs
  SET last_enqueued_at = now(),
      updated_at = now()
  WHERE id = job_id;
END;
$$;


ALTER FUNCTION "public"."mark_recurring_job_enqueued"("job_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_unread_alert_sent"("p_coach_id" "uuid", "p_unread_count" integer) RETURNS "void"
    LANGUAGE "sql"
    AS $$
  UPDATE public.profiles
  SET last_unread_alert_at = now(),
      last_unread_alert_count = p_unread_count
  WHERE id = p_coach_id;
$$;


ALTER FUNCTION "public"."mark_unread_alert_sent"("p_coach_id" "uuid", "p_unread_count" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."mark_unread_alert_sent"("p_coach_id" "uuid", "p_unread_count" integer) IS 'Updates profile metadata after successfully sending an unread alert.';



CREATE OR REPLACE FUNCTION "public"."post_private_reply"("p_conversation_id" "uuid", "p_body" "text", "p_recipient" "uuid") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."post_private_reply"("p_conversation_id" "uuid", "p_body" "text", "p_recipient" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_private_reply"("p_conversation_id" "uuid", "p_body" "text", "p_recipient" "uuid", "p_parent_message_id" bigint DEFAULT NULL::bigint) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."post_private_reply"("p_conversation_id" "uuid", "p_body" "text", "p_recipient" "uuid", "p_parent_message_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recompute_thread_roots"("p_conversation_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."recompute_thread_roots"("p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recompute_thread_stats"("p_conversation_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."recompute_thread_stats"("p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_drafts_for_user"("p_user_id" "uuid", "p_query" "text") RETURNS TABLE("id" "uuid", "mode" "text", "body" "text", "subject" "text", "dm_recipient_id" "uuid", "recipient_name" "text", "recipient_email" "text", "updated_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    d.id,
    d.mode,
    d.body,
    d.subject,
    d.dm_recipient_id,
    COALESCE(p.first_name || ' ' || p.last_name, p.email) AS recipient_name,
    p.email AS recipient_email,
    d.updated_at
  FROM public.message_drafts d
  LEFT JOIN public.profiles p ON p.id = d.dm_recipient_id
  WHERE d.user_id = p_user_id
    AND (
      d.subject ILIKE '%' || p_query || '%'
      OR d.body ILIKE '%' || p_query || '%'
      OR COALESCE(p.first_name || ' ' || p.last_name, p.email) ILIKE '%' || p_query || '%'
      OR p.email ILIKE '%' || p_query || '%'
    )
  ORDER BY d.updated_at DESC
  LIMIT 200;
$$;


ALTER FUNCTION "public"."search_drafts_for_user"("p_user_id" "uuid", "p_query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_message_items"("p_user_id" "uuid", "p_query" "text", "p_archived" boolean DEFAULT false) RETURNS TABLE("id" "uuid", "conversation_id" "uuid", "sender_id" "uuid", "body" "text", "created_at" timestamp with time zone, "parent_message_id" "uuid", "thread_root_id" "uuid", "sender_name" "text", "sender_email" "text", "conversation_title" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    m.id,
    m.conversation_id,
    m.sender_id,
    m.body,
    m.created_at,
    m.parent_message_id,
    m.thread_root_id,
    p.first_name || ' ' || p.last_name AS sender_name,
    p.email AS sender_email,
    c.title AS conversation_title
  FROM public.messages m
  JOIN public.conversations c ON c.id = m.conversation_id
  JOIN public.profiles p ON p.id = m.sender_id
  JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
  LEFT JOIN public.message_user_state mus
    ON mus.message_id = m.id AND mus.user_id = p_user_id
  WHERE cm.user_id = p_user_id
    AND (
      (p_archived = false AND (mus.archived_at IS NULL OR mus.user_id IS NULL))
      OR (p_archived = true AND mus.archived_at IS NOT NULL)
    )
    AND (
      m.body ILIKE '%' || p_query || '%'
      OR c.title ILIKE '%' || p_query || '%'
      OR (p.first_name || ' ' || p.last_name) ILIKE '%' || p_query || '%'
      OR p.email ILIKE '%' || p_query || '%'
    )
  ORDER BY m.created_at DESC
  LIMIT 500;
$$;


ALTER FUNCTION "public"."search_message_items"("p_user_id" "uuid", "p_query" "text", "p_archived" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_job_queue_settings_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_job_queue_settings_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_job_queue_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_job_queue_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_profile_update_token_with_expiry"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.profile_update_token := generate_profile_update_token();
    NEW.profile_update_token_expires := NOW() + INTERVAL '7 days';
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_profile_update_token_with_expiry"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."toggle_cron_job"("job_name" "text", "new_active" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'cron'
    AS $$
begin
  update cron.job
  set active = new_active
  where jobname = job_name;

  if not found then
    raise exception 'Cron job not found: %', job_name;
  end if;
end;
$$;


ALTER FUNCTION "public"."toggle_cron_job"("job_name" "text", "new_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."toggle_message_flag"("p_message_id" "uuid", "p_flagged" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."toggle_message_flag"("p_message_id" "uuid", "p_flagged" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."toggle_message_flag"("p_message_id" "uuid", "p_flagged" boolean) IS 'Toggle flag state for current user on a message';



CREATE OR REPLACE FUNCTION "public"."unarchive_message_user"("p_message_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."unarchive_message_user"("p_message_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."unarchive_message_user"("p_message_id" "uuid") IS 'Unarchive a message for current user (restore visibility)';



CREATE OR REPLACE FUNCTION "public"."update_cron_schedule"("job_name" "text", "new_schedule" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'cron'
    AS $$
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
$$;


ALTER FUNCTION "public"."update_cron_schedule"("job_name" "text", "new_schedule" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_game_platform_sync_state_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_game_platform_sync_state_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_message_drafts_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_message_drafts_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_message_user_state_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_message_user_state_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_thread_stats"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
end; $$;


ALTER FUNCTION "public"."update_thread_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "entity_type" "text",
    "entity_id" "uuid",
    "metadata" "jsonb",
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."activity_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_alert_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "message_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_alert_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agreements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competitor_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'zoho'::"text" NOT NULL,
    "request_id" "text" NOT NULL,
    "status" "text" DEFAULT 'sent'::"text" NOT NULL,
    "signers" "jsonb",
    "signed_pdf_path" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "template_kind" "text" DEFAULT 'adult'::"text" NOT NULL,
    "zoho_completed" boolean DEFAULT false,
    "completion_source" "public"."completion_source" DEFAULT 'zoho'::"public"."completion_source",
    "manual_completion_reason" "text" DEFAULT 'Manual completion'::"text",
    "manual_uploaded_path" "text",
    "manual_completed_at" timestamp with time zone,
    "zoho_request_status" "text",
    "recipient_email_verification_sent_at" timestamp with time zone,
    "recipient_email_verification_status" "text",
    "recipient_email_verification_error" "text",
    CONSTRAINT "agreements_manual_completion_check" CHECK (((("completion_source" = 'manual'::"public"."completion_source") AND ("manual_uploaded_path" IS NOT NULL) AND ("manual_completed_at" IS NOT NULL)) OR ("completion_source" = 'zoho'::"public"."completion_source"))),
    CONSTRAINT "agreements_template_kind_check" CHECK (("template_kind" = ANY (ARRAY['adult'::"text", 'minor'::"text"])))
);


ALTER TABLE "public"."agreements" OWNER TO "postgres";


COMMENT ON COLUMN "public"."agreements"."zoho_completed" IS 'Indicates whether a manually completed agreement has been marked as complete in Zoho Sign';



COMMENT ON COLUMN "public"."agreements"."completion_source" IS 'Indicates whether agreement was completed via Zoho or manual upload';



COMMENT ON COLUMN "public"."agreements"."manual_completion_reason" IS 'Reason for manual completion (default: Manual completion)';



COMMENT ON COLUMN "public"."agreements"."manual_uploaded_path" IS 'Path to manually uploaded document in Supabase Storage';



COMMENT ON COLUMN "public"."agreements"."manual_completed_at" IS 'Timestamp when manual completion occurred';



COMMENT ON COLUMN "public"."agreements"."zoho_request_status" IS 'Optional mirroring of Zoho request status for audit purposes';



CREATE TABLE IF NOT EXISTS "public"."alert_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "channel" "text" NOT NULL,
    "unread_count" integer NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "error_text" "text",
    CONSTRAINT "alert_log_channel_check" CHECK (("channel" = ANY (ARRAY['email'::"text", 'sms'::"text"])))
);


ALTER TABLE "public"."alert_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."alert_log" IS 'Audit log for unread message alerts (email/SMS).';



COMMENT ON COLUMN "public"."alert_log"."channel" IS 'Delivery channel used for the alert (email or sms)';



COMMENT ON COLUMN "public"."alert_log"."unread_count" IS 'Unread message count at the time the alert was attempted';



COMMENT ON COLUMN "public"."alert_log"."error_text" IS 'Error returned by the provider when the alert failed (if any)';



CREATE TABLE IF NOT EXISTS "public"."archived_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "archived_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archive_data" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."archived_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."competitors" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "email_personal" "text",
    "email_school" "text",
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "is_18_or_over" boolean DEFAULT false,
    "grade" "text",
    "parent_name" "text",
    "parent_email" "text",
    "gender" "text",
    "race" "text",
    "ethnicity" "text",
    "level_of_technology" "text",
    "years_competing" integer,
    "media_release_date" timestamp with time zone,
    "participation_agreement_date" timestamp with time zone,
    "adobe_sign_document_id" "text",
    "profile_update_token" "text",
    "profile_update_token_expires" timestamp with time zone,
    "game_platform_id" "text",
    "game_platform_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_active" boolean DEFAULT true,
    "status" "text" DEFAULT 'pending'::"text",
    "division" "public"."competitor_division",
    "game_platform_sync_error" "text",
    "syned_school_id" "text",
    "syned_region_id" "text",
    "syned_coach_user_id" "text",
    "program_track" "text",
    "parent_email_is_valid" boolean,
    "parent_email_validated_at" timestamp with time zone,
    "parent_email_invalid_reason" "text",
    CONSTRAINT "competitors_program_track_check" CHECK (("program_track" = ANY (ARRAY['traditional'::"text", 'adult_ed'::"text"])))
);


ALTER TABLE "public"."competitors" OWNER TO "postgres";


COMMENT ON COLUMN "public"."competitors"."program_track" IS 'Sub-classification for college competitors (traditional vs continuing/adult education)';



CREATE OR REPLACE VIEW "public"."coach_competitor_counts" WITH ("security_invoker"='on') AS
 SELECT "coach_id",
    "count"(*) AS "competitor_count"
   FROM "public"."competitors" "c"
  GROUP BY "coach_id";


ALTER VIEW "public"."coach_competitor_counts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_library_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "file_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "content_type" "text",
    "description" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."coach_library_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_members" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "competitor_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"(),
    "position" integer,
    "game_platform_synced_at" timestamp with time zone,
    "game_platform_sync_error" "text",
    CONSTRAINT "team_members_position_check" CHECK ((("position" >= 1) AND ("position" <= 6)))
);


ALTER TABLE "public"."team_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "division" "text",
    "status" "public"."team_status" DEFAULT 'forming'::"public"."team_status",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "image_url" "text",
    "game_platform_id" "text",
    "game_platform_synced_at" timestamp with time zone,
    "game_platform_sync_error" "text",
    "affiliation" "text",
    "syned_coach_user_id" "text",
    "coach_game_platform_id" "text"
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


COMMENT ON COLUMN "public"."teams"."image_url" IS 'URL to team image stored in Supabase Storage';



CREATE OR REPLACE VIEW "public"."comp_team_view" WITH ("security_invoker"='on') AS
 SELECT "c"."id",
    "c"."first_name",
    "c"."last_name",
    "c"."email_personal",
    "c"."email_school",
    "c"."is_18_or_over",
    "c"."grade",
    "c"."status",
    "c"."media_release_date",
    "c"."participation_agreement_date",
    "c"."game_platform_id",
    "c"."game_platform_synced_at",
    "c"."profile_update_token",
    "c"."profile_update_token_expires",
    "c"."created_at",
    "c"."is_active",
    "t"."id" AS "team_id",
    "t"."name" AS "team_name",
    "tm"."position" AS "team_position"
   FROM (("public"."competitors" "c"
     LEFT JOIN "public"."team_members" "tm" ON (("c"."id" = "tm"."competitor_id")))
     LEFT JOIN "public"."teams" "t" ON (("tm"."team_id" = "t"."id")))
  WHERE ("c"."coach_id" = "auth"."uid"());


ALTER VIEW "public"."comp_team_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_members" (
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "muted_until" timestamp with time zone,
    "last_read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."conversation_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "title" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "conversations_type_check" CHECK (("type" = ANY (ARRAY['dm'::"text", 'group'::"text", 'announcement'::"text"])))
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_platform_challenge_solves" (
    "id" bigint NOT NULL,
    "synced_user_id" "text" NOT NULL,
    "metactf_user_id" bigint,
    "synced_team_id" "text",
    "challenge_solve_id" bigint NOT NULL,
    "challenge_id" bigint,
    "challenge_title" "text",
    "challenge_category" "text",
    "challenge_points" integer,
    "solved_at" timestamp with time zone,
    "source" "text" DEFAULT 'odl'::"text" NOT NULL,
    "raw_payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "game_platform_challenge_solves_source_check" CHECK (("source" = ANY (ARRAY['odl'::"text", 'flash_ctf'::"text"])))
);


ALTER TABLE "public"."game_platform_challenge_solves" OWNER TO "postgres";


ALTER TABLE "public"."game_platform_challenge_solves" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."game_platform_challenge_solves_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."game_platform_flash_ctf_events" (
    "id" bigint NOT NULL,
    "synced_user_id" "text" NOT NULL,
    "metactf_user_id" bigint,
    "event_id" "text" NOT NULL,
    "flash_ctf_name" "text",
    "challenges_solved" integer DEFAULT 0,
    "points_earned" integer DEFAULT 0,
    "rank" integer,
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "raw_payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "max_points_possible" integer
);


ALTER TABLE "public"."game_platform_flash_ctf_events" OWNER TO "postgres";


ALTER TABLE "public"."game_platform_flash_ctf_events" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."game_platform_flash_ctf_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."game_platform_profiles" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "coach_id" "uuid",
    "competitor_id" "uuid",
    "metactf_role" "public"."metactf_role" NOT NULL,
    "synced_user_id" "text",
    "metactf_user_id" integer,
    "metactf_username" "text",
    "status" "public"."metactf_sync_status" DEFAULT 'pending'::"public"."metactf_sync_status",
    "last_synced_at" timestamp with time zone,
    "sync_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "game_platform_profiles_check" CHECK (((("coach_id" IS NOT NULL) AND ("competitor_id" IS NULL)) OR (("coach_id" IS NULL) AND ("competitor_id" IS NOT NULL))))
);


ALTER TABLE "public"."game_platform_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_platform_stats" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "competitor_id" "uuid" NOT NULL,
    "challenges_completed" integer DEFAULT 0,
    "monthly_ctf_challenges" integer DEFAULT 0,
    "total_score" integer DEFAULT 0,
    "last_activity" timestamp with time zone,
    "synced_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."game_platform_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_platform_stats_raw_data_backup" (
    "competitor_id" "uuid" NOT NULL,
    "raw_data" "jsonb",
    "backed_up_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."game_platform_stats_raw_data_backup" OWNER TO "postgres";


COMMENT ON TABLE "public"."game_platform_stats_raw_data_backup" IS 'Backup of raw_data column dropped on 2025-10-06. Can be deleted after 30 days if no issues arise. See docs/game-platform/MIGRATION-remove-raw-data-field.md';



CREATE TABLE IF NOT EXISTS "public"."game_platform_sync_events" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "profile_id" "uuid",
    "team_id" "uuid",
    "event_type" "text" NOT NULL,
    "request_payload" "jsonb",
    "response_payload" "jsonb",
    "status" "public"."metactf_sync_status",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."game_platform_sync_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_platform_sync_runs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "competitors_synced" integer DEFAULT 0,
    "competitors_failed" integer DEFAULT 0,
    "error_message" "text",
    "sync_type" "text" DEFAULT 'incremental'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."game_platform_sync_runs" OWNER TO "postgres";


COMMENT ON TABLE "public"."game_platform_sync_runs" IS 'Tracks global sync job executions for game platform data. Used to determine the after_time_unix for incremental syncs.';



CREATE TABLE IF NOT EXISTS "public"."game_platform_sync_state" (
    "synced_user_id" "text" NOT NULL,
    "last_odl_synced_at" timestamp with time zone,
    "last_flash_ctf_synced_at" timestamp with time zone,
    "last_remote_accessed_at" timestamp with time zone,
    "last_attempt_at" timestamp with time zone,
    "last_result" "text",
    "error_message" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "needs_totals_refresh" boolean DEFAULT false,
    "last_login_at" timestamp with time zone,
    CONSTRAINT "game_platform_sync_state_last_result_check" CHECK (("last_result" = ANY (ARRAY['success'::"text", 'failure'::"text"])))
);


ALTER TABLE "public"."game_platform_sync_state" OWNER TO "postgres";


COMMENT ON COLUMN "public"."game_platform_sync_state"."needs_totals_refresh" IS 'Flag indicating competitor has new challenge solves and needs aggregate totals refreshed. Set by incremental sync job, cleared by totals refresh sweep job.';



CREATE TABLE IF NOT EXISTS "public"."game_platform_teams" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "team_id" "uuid",
    "synced_team_id" "text",
    "metactf_team_id" integer,
    "metactf_team_name" "text",
    "status" "public"."metactf_sync_status" DEFAULT 'pending'::"public"."metactf_sync_status",
    "last_synced_at" timestamp with time zone,
    "sync_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."game_platform_teams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_queue_settings" (
    "id" integer DEFAULT 1 NOT NULL,
    "processing_enabled" boolean DEFAULT true NOT NULL,
    "paused_reason" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "job_queue_settings_singleton" CHECK (("id" = 1))
);


ALTER TABLE "public"."job_queue_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_worker_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "source" "text" NOT NULL,
    "http_method" "text",
    "user_agent" "text",
    "status" "text",
    "processed" integer DEFAULT 0 NOT NULL,
    "succeeded" integer,
    "failed" integer,
    "message" "text",
    "error_message" "text",
    "results" "jsonb"
);


ALTER TABLE "public"."job_worker_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "mode" "text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "subject" "text" DEFAULT ''::"text",
    "high_priority" boolean DEFAULT false NOT NULL,
    "dm_recipient_id" "uuid",
    "group_recipient_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "conversation_id" "uuid",
    "thread_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "message_drafts_mode_check" CHECK (("mode" = ANY (ARRAY['dm'::"text", 'group'::"text", 'announcement'::"text", 'reply'::"text", 'forward'::"text"])))
);


ALTER TABLE "public"."message_drafts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_read_receipts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."message_read_receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_user_state" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "message_id" "uuid" NOT NULL,
    "flagged" boolean DEFAULT false NOT NULL,
    "archived_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."message_user_state" OWNER TO "postgres";


COMMENT ON TABLE "public"."message_user_state" IS 'FERPA-compliant per-user message state isolation - flags and archives are private to each user';



CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parent_message_id" "uuid",
    "thread_root_id" "uuid",
    "thread_reply_count" integer DEFAULT 0,
    "thread_last_reply_at" timestamp with time zone,
    "high_priority" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nice_framework_work_roles" (
    "work_role_id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "category" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."nice_framework_work_roles" OWNER TO "postgres";


COMMENT ON TABLE "public"."nice_framework_work_roles" IS 'Reference table for NIST NICE Framework work roles - used to translate codes into human-readable titles';



COMMENT ON COLUMN "public"."nice_framework_work_roles"."work_role_id" IS 'Unique NICE Framework work role identifier (e.g., DD-WRL-003)';



COMMENT ON COLUMN "public"."nice_framework_work_roles"."title" IS 'Human-readable work role title';



COMMENT ON COLUMN "public"."nice_framework_work_roles"."description" IS 'Full description from NIST NICE Framework';



COMMENT ON COLUMN "public"."nice_framework_work_roles"."category" IS 'Work role category: OG (Oversee & Govern), DD (Design & Development), IO (Operate & Maintain), PD (Protect & Defend), IN (Investigate)';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "public"."user_role" DEFAULT 'coach'::"public"."user_role" NOT NULL,
    "full_name" "text" NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "school_name" "text" NOT NULL,
    "mobile_number" "text",
    "division" "text",
    "region" "text",
    "monday_coach_id" "text",
    "is_approved" boolean DEFAULT false,
    "live_scan_completed" boolean DEFAULT false,
    "mandated_reporter_completed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "game_platform_user_id" "text",
    "game_platform_last_synced_at" timestamp with time zone,
    "instant_sms_enabled" boolean DEFAULT false,
    "email_alerts_enabled" boolean DEFAULT true,
    "email_alert_address" "text",
    "sms_notifications_enabled" boolean DEFAULT false,
    "last_unread_alert_at" timestamp with time zone,
    "last_unread_alert_count" integer
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."instant_sms_enabled" IS 'For admins: receive instant SMS when they get a new message (not digest)';



COMMENT ON COLUMN "public"."profiles"."email_alerts_enabled" IS 'Whether the coach wants to receive unread message alerts via email';



COMMENT ON COLUMN "public"."profiles"."email_alert_address" IS 'Optional override email address for unread alerts; defaults to login email if null';



COMMENT ON COLUMN "public"."profiles"."sms_notifications_enabled" IS 'Whether the coach wants to receive SMS notifications';



COMMENT ON COLUMN "public"."profiles"."last_unread_alert_at" IS 'Timestamp of the last unread message alert that was sent (email or SMS)';



COMMENT ON COLUMN "public"."profiles"."last_unread_alert_count" IS 'Unread message count that triggered the most recent alert';



CREATE OR REPLACE VIEW "public"."release_eligible_competitors" WITH ("security_invoker"='on') AS
 SELECT "id",
    "coach_id",
    "email_personal",
    "email_school",
    "first_name",
    "last_name",
    "is_18_or_over",
    "grade",
    "parent_name",
    "parent_email",
    "gender",
    "race",
    "ethnicity",
    "level_of_technology",
    "years_competing",
    "media_release_date",
    "participation_agreement_date",
    "adobe_sign_document_id",
    "profile_update_token",
    "profile_update_token_expires",
    "game_platform_id",
    "game_platform_synced_at",
    "created_at",
    "updated_at",
    "is_active",
    "status",
    "division",
    "game_platform_sync_error",
    "syned_school_id",
    "syned_region_id",
    "syned_coach_user_id",
    "parent_email_is_valid",
    "parent_email_validated_at",
    "parent_email_invalid_reason"
   FROM "public"."competitors"
  WHERE ("is_active" AND ("status" = ANY (ARRAY['profile'::"text", 'compliance'::"text", 'in_the_game_not_compliant'::"text", 'complete'::"text"])));


ALTER VIEW "public"."release_eligible_competitors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_config" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "description" "text",
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."system_config" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_conversation_members_with_profile" WITH ("security_invoker"='on') AS
 SELECT "cm"."conversation_id",
    "cm"."user_id",
    "cm"."role",
    "cm"."joined_at",
    "p"."first_name",
    "p"."last_name",
    "p"."email"
   FROM ("public"."conversation_members" "cm"
     JOIN "public"."profiles" "p" ON (("p"."id" = "cm"."user_id")));


ALTER VIEW "public"."v_conversation_members_with_profile" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_messages_with_sender" WITH ("security_invoker"='on') AS
 SELECT "m"."id",
    "m"."conversation_id",
    "m"."sender_id",
    "m"."body",
    "m"."created_at",
    "p"."first_name",
    "p"."last_name",
    "p"."email"
   FROM ("public"."messages" "m"
     JOIN "public"."profiles" "p" ON (("p"."id" = "m"."sender_id")));


ALTER VIEW "public"."v_messages_with_sender" OWNER TO "postgres";


ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_alert_queue"
    ADD CONSTRAINT "admin_alert_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agreements"
    ADD CONSTRAINT "agreements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."alert_log"
    ADD CONSTRAINT "alert_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."archived_messages"
    ADD CONSTRAINT "archived_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_library_documents"
    ADD CONSTRAINT "coach_library_documents_file_path_key" UNIQUE ("file_path");



ALTER TABLE ONLY "public"."coach_library_documents"
    ADD CONSTRAINT "coach_library_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."competitors"
    ADD CONSTRAINT "competitors_coach_school_email_student_id_unique" UNIQUE ("coach_id", "email_school", "game_platform_id");



ALTER TABLE ONLY "public"."competitors"
    ADD CONSTRAINT "competitors_game_platform_id_key" UNIQUE ("game_platform_id");



ALTER TABLE ONLY "public"."competitors"
    ADD CONSTRAINT "competitors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."competitors"
    ADD CONSTRAINT "competitors_profile_update_token_key" UNIQUE ("profile_update_token");



ALTER TABLE ONLY "public"."conversation_members"
    ADD CONSTRAINT "conversation_members_pkey" PRIMARY KEY ("conversation_id", "user_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_platform_challenge_solves"
    ADD CONSTRAINT "game_platform_challenge_solves_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_platform_challenge_solves"
    ADD CONSTRAINT "game_platform_challenge_solves_synced_user_solve_key" UNIQUE ("synced_user_id", "challenge_solve_id");



ALTER TABLE ONLY "public"."game_platform_flash_ctf_events"
    ADD CONSTRAINT "game_platform_flash_ctf_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_platform_flash_ctf_events"
    ADD CONSTRAINT "game_platform_flash_ctf_events_synced_user_event_key" UNIQUE ("synced_user_id", "event_id");



ALTER TABLE ONLY "public"."game_platform_profiles"
    ADD CONSTRAINT "game_platform_profiles_coach_id_key" UNIQUE ("coach_id");



ALTER TABLE ONLY "public"."game_platform_profiles"
    ADD CONSTRAINT "game_platform_profiles_competitor_id_key" UNIQUE ("competitor_id");



ALTER TABLE ONLY "public"."game_platform_profiles"
    ADD CONSTRAINT "game_platform_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_platform_profiles"
    ADD CONSTRAINT "game_platform_profiles_synced_user_id_key" UNIQUE ("synced_user_id");



ALTER TABLE ONLY "public"."game_platform_stats"
    ADD CONSTRAINT "game_platform_stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_platform_stats_raw_data_backup"
    ADD CONSTRAINT "game_platform_stats_raw_data_backup_pkey" PRIMARY KEY ("competitor_id");



ALTER TABLE ONLY "public"."game_platform_sync_events"
    ADD CONSTRAINT "game_platform_sync_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_platform_sync_runs"
    ADD CONSTRAINT "game_platform_sync_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_platform_sync_state"
    ADD CONSTRAINT "game_platform_sync_state_pkey" PRIMARY KEY ("synced_user_id");



ALTER TABLE ONLY "public"."game_platform_teams"
    ADD CONSTRAINT "game_platform_teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_platform_teams"
    ADD CONSTRAINT "game_platform_teams_team_id_key" UNIQUE ("team_id");



ALTER TABLE ONLY "public"."job_queue"
    ADD CONSTRAINT "job_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_queue_settings"
    ADD CONSTRAINT "job_queue_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_worker_runs"
    ADD CONSTRAINT "job_worker_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_drafts"
    ADD CONSTRAINT "message_drafts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_read_receipts"
    ADD CONSTRAINT "message_read_receipts_message_id_user_id_key" UNIQUE ("message_id", "user_id");



ALTER TABLE ONLY "public"."message_read_receipts"
    ADD CONSTRAINT "message_read_receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_user_state"
    ADD CONSTRAINT "message_user_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_user_state"
    ADD CONSTRAINT "message_user_state_user_id_message_id_key" UNIQUE ("user_id", "message_id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_id_key" UNIQUE ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nice_framework_work_roles"
    ADD CONSTRAINT "nice_framework_work_roles_pkey" PRIMARY KEY ("work_role_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_monday_coach_id_key" UNIQUE ("monday_coach_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_config"
    ADD CONSTRAINT "system_config_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."system_config"
    ADD CONSTRAINT "system_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_competitor_id_key" UNIQUE ("competitor_id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_team_id_competitor_id_key" UNIQUE ("team_id", "competitor_id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_coach_id_name_key" UNIQUE ("coach_id", "name");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "admin_alert_queue_recipient_message_idx" ON "public"."admin_alert_queue" USING "btree" ("recipient_id", "message_id");



CREATE INDEX "agreements_completion_source_idx" ON "public"."agreements" USING "btree" ("completion_source");



CREATE INDEX "agreements_idx1" ON "public"."agreements" USING "btree" ("competitor_id");



CREATE INDEX "agreements_idx2" ON "public"."agreements" USING "btree" ("provider", "request_id");



CREATE INDEX "agreements_manual_completed_at_idx" ON "public"."agreements" USING "btree" ("manual_completed_at");



CREATE INDEX "agreements_recipient_email_verification_candidates_idx" ON "public"."agreements" USING "btree" ("created_at") WHERE (("provider" = 'zoho'::"text") AND ("template_kind" = 'minor'::"text") AND ("status" = 'sent'::"text") AND ("recipient_email_verification_sent_at" IS NULL));



CREATE INDEX "agreements_zoho_completed_idx" ON "public"."agreements" USING "btree" ("zoho_completed") WHERE ("zoho_completed" = false);



CREATE UNIQUE INDEX "game_platform_teams_synced_idx" ON "public"."game_platform_teams" USING "btree" ("synced_team_id") WHERE ("synced_team_id" IS NOT NULL);



CREATE INDEX "idx_activity_logs_created_at" ON "public"."activity_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_activity_logs_user_id" ON "public"."activity_logs" USING "btree" ("user_id");



CREATE INDEX "idx_alert_log_coach_channel" ON "public"."alert_log" USING "btree" ("coach_id", "channel", "sent_at" DESC);



CREATE INDEX "idx_archived_messages_user_archived_at" ON "public"."archived_messages" USING "btree" ("user_id", "archived_at" DESC);



CREATE INDEX "idx_competitors_coach_id" ON "public"."competitors" USING "btree" ("coach_id");



CREATE INDEX "idx_competitors_division_active" ON "public"."competitors" USING "btree" ("coach_id", "division", "is_active");



CREATE INDEX "idx_competitors_game_platform_id" ON "public"."competitors" USING "btree" ("game_platform_id");



CREATE INDEX "idx_conversation_members_user" ON "public"."conversation_members" USING "btree" ("user_id");



CREATE INDEX "idx_game_platform_challenge_solves_category" ON "public"."game_platform_challenge_solves" USING "btree" ("challenge_category");



CREATE INDEX "idx_game_platform_challenge_solves_user" ON "public"."game_platform_challenge_solves" USING "btree" ("synced_user_id", "solved_at" DESC);



CREATE INDEX "idx_game_platform_flash_ctf_events_user" ON "public"."game_platform_flash_ctf_events" USING "btree" ("synced_user_id", "started_at" DESC);



CREATE INDEX "idx_game_platform_stats_competitor_id" ON "public"."game_platform_stats" USING "btree" ("competitor_id");



CREATE INDEX "idx_game_platform_sync_state_needs_refresh" ON "public"."game_platform_sync_state" USING "btree" ("needs_totals_refresh") WHERE ("needs_totals_refresh" = true);



CREATE INDEX "idx_job_queue_recurring_next_run" ON "public"."job_queue" USING "btree" ("is_recurring", "last_run_at", "run_at") WHERE (("is_recurring" = true) AND ("status" = 'pending'::"text"));



CREATE INDEX "idx_job_queue_status_run_at" ON "public"."job_queue" USING "btree" ("status", "run_at");



CREATE INDEX "idx_job_queue_task_type" ON "public"."job_queue" USING "btree" ("task_type");



CREATE INDEX "idx_job_worker_runs_started_at_desc" ON "public"."job_worker_runs" USING "btree" ("started_at" DESC);



CREATE INDEX "idx_message_drafts_conversation" ON "public"."message_drafts" USING "btree" ("conversation_id");



CREATE INDEX "idx_message_drafts_thread" ON "public"."message_drafts" USING "btree" ("thread_id");



CREATE INDEX "idx_message_drafts_user_updated" ON "public"."message_drafts" USING "btree" ("user_id", "updated_at" DESC);



CREATE INDEX "idx_message_read_receipts_user" ON "public"."message_read_receipts" USING "btree" ("user_id", "read_at" DESC);



CREATE INDEX "idx_message_user_state_message_flagged" ON "public"."message_user_state" USING "btree" ("message_id") WHERE ("flagged" = true);



CREATE INDEX "idx_message_user_state_user_archived" ON "public"."message_user_state" USING "btree" ("user_id") WHERE ("archived_at" IS NOT NULL);



CREATE INDEX "idx_message_user_state_user_flagged" ON "public"."message_user_state" USING "btree" ("user_id") WHERE ("flagged" = true);



CREATE INDEX "idx_message_user_state_user_message" ON "public"."message_user_state" USING "btree" ("user_id", "message_id");



CREATE INDEX "idx_messages_conversation_created_at" ON "public"."messages" USING "btree" ("conversation_id", "created_at" DESC);



CREATE INDEX "idx_messages_parent" ON "public"."messages" USING "btree" ("parent_message_id") WHERE ("parent_message_id" IS NOT NULL);



CREATE INDEX "idx_messages_thread_activity" ON "public"."messages" USING "btree" ("conversation_id", "thread_last_reply_at" DESC) WHERE (("thread_root_id" IS NULL) AND ("thread_reply_count" > 0));



CREATE INDEX "idx_messages_thread_root" ON "public"."messages" USING "btree" ("thread_root_id") WHERE ("thread_root_id" IS NOT NULL);



CREATE INDEX "idx_nice_work_roles_category" ON "public"."nice_framework_work_roles" USING "btree" ("category");



CREATE UNIQUE INDEX "idx_profiles_game_platform_user_id" ON "public"."profiles" USING "btree" ("game_platform_user_id") WHERE ("game_platform_user_id" IS NOT NULL);



CREATE INDEX "idx_sync_runs_completed" ON "public"."game_platform_sync_runs" USING "btree" ("completed_at" DESC) WHERE ("status" = 'completed'::"text");



CREATE INDEX "idx_team_members_competitor_id" ON "public"."team_members" USING "btree" ("competitor_id");



CREATE INDEX "idx_team_members_team_id" ON "public"."team_members" USING "btree" ("team_id");



CREATE UNIQUE INDEX "idx_teams_game_platform_id" ON "public"."teams" USING "btree" ("game_platform_id") WHERE ("game_platform_id" IS NOT NULL);



CREATE INDEX "idx_teams_image_url" ON "public"."teams" USING "btree" ("image_url");



CREATE OR REPLACE TRIGGER "enforce_team_size" BEFORE INSERT ON "public"."team_members" FOR EACH ROW EXECUTE FUNCTION "public"."check_team_size"();



CREATE OR REPLACE TRIGGER "job_queue_set_updated_at" BEFORE UPDATE ON "public"."job_queue" FOR EACH ROW EXECUTE FUNCTION "public"."set_job_queue_updated_at"();



CREATE OR REPLACE TRIGGER "job_queue_settings_set_updated_at" BEFORE UPDATE ON "public"."job_queue_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_job_queue_settings_updated_at"();



CREATE OR REPLACE TRIGGER "set_profile_update_token" BEFORE INSERT ON "public"."competitors" FOR EACH ROW EXECUTE FUNCTION "public"."set_profile_update_token_with_expiry"();



CREATE OR REPLACE TRIGGER "trg_enforce_same_conversation" BEFORE INSERT OR UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_same_conversation"();



CREATE OR REPLACE TRIGGER "trg_game_platform_sync_state_updated" BEFORE UPDATE ON "public"."game_platform_sync_state" FOR EACH ROW EXECUTE FUNCTION "public"."update_game_platform_sync_state_timestamp"();



CREATE OR REPLACE TRIGGER "trigger_update_thread_stats" BEFORE INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."update_thread_stats"();



CREATE OR REPLACE TRIGGER "update_competitors_updated_at" BEFORE UPDATE ON "public"."competitors" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_message_drafts_updated_at" BEFORE UPDATE ON "public"."message_drafts" FOR EACH ROW EXECUTE FUNCTION "public"."update_message_drafts_updated_at"();



CREATE OR REPLACE TRIGGER "update_message_user_state_updated_at" BEFORE UPDATE ON "public"."message_user_state" FOR EACH ROW EXECUTE FUNCTION "public"."update_message_user_state_updated_at"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_teams_updated_at" BEFORE UPDATE ON "public"."teams" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_alert_queue"
    ADD CONSTRAINT "admin_alert_queue_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_alert_queue"
    ADD CONSTRAINT "admin_alert_queue_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agreements"
    ADD CONSTRAINT "agreements_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."alert_log"
    ADD CONSTRAINT "alert_log_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."archived_messages"
    ADD CONSTRAINT "archived_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competitors"
    ADD CONSTRAINT "competitors_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_members"
    ADD CONSTRAINT "conversation_members_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_members"
    ADD CONSTRAINT "conversation_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."game_platform_profiles"
    ADD CONSTRAINT "game_platform_profiles_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_platform_profiles"
    ADD CONSTRAINT "game_platform_profiles_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_platform_stats"
    ADD CONSTRAINT "game_platform_stats_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_platform_sync_events"
    ADD CONSTRAINT "game_platform_sync_events_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."game_platform_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_platform_sync_events"
    ADD CONSTRAINT "game_platform_sync_events_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."game_platform_teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_platform_teams"
    ADD CONSTRAINT "game_platform_teams_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_drafts"
    ADD CONSTRAINT "message_drafts_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."message_drafts"
    ADD CONSTRAINT "message_drafts_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."message_drafts"
    ADD CONSTRAINT "message_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_read_receipts"
    ADD CONSTRAINT "message_read_receipts_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_read_receipts"
    ADD CONSTRAINT "message_read_receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_user_state"
    ADD CONSTRAINT "message_user_state_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_user_state"
    ADD CONSTRAINT "message_user_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_parent_message_id_fkey" FOREIGN KEY ("parent_message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_thread_root_id_fkey" FOREIGN KEY ("thread_root_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."system_config"
    ADD CONSTRAINT "system_config_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can view sync runs" ON "public"."game_platform_sync_runs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"public"."user_role")))));



CREATE POLICY "Coaches can manage own competitors" ON "public"."competitors" TO "authenticated" USING (("auth"."uid"() = "coach_id"));



CREATE POLICY "Coaches can manage own team members" ON "public"."team_members" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."teams"
  WHERE (("teams"."id" = "team_members"."team_id") AND ("teams"."coach_id" = "auth"."uid"())))));



CREATE POLICY "Coaches can manage own teams" ON "public"."teams" TO "authenticated" USING (("auth"."uid"() = "coach_id"));



CREATE POLICY "Service role can manage sync runs" ON "public"."game_platform_sync_runs" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Users can create their own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can create their own read receipts" ON "public"."message_read_receipts" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM ("public"."messages" "m"
     JOIN "public"."conversation_members" "cm" ON (("cm"."conversation_id" = "m"."conversation_id")))
  WHERE (("m"."id" = "message_read_receipts"."message_id") AND ("cm"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can delete their own archived items" ON "public"."archived_messages" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own drafts" ON "public"."message_drafts" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own message state" ON "public"."message_user_state" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own activity logs" ON "public"."activity_logs" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own archived items" ON "public"."archived_messages" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own drafts" ON "public"."message_drafts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own message state" ON "public"."message_user_state" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage own profile" ON "public"."profiles" TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own drafts" ON "public"."message_drafts" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own message state" ON "public"."message_user_state" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own activity logs" ON "public"."activity_logs" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own competitor stats" ON "public"."game_platform_stats" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."competitors"
  WHERE (("competitors"."id" = "game_platform_stats"."competitor_id") AND ("competitors"."coach_id" = "auth"."uid"())))));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view read receipts in their conversations" ON "public"."message_read_receipts" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."messages" "m"
     JOIN "public"."conversation_members" "cm" ON (("cm"."conversation_id" = "m"."conversation_id")))
  WHERE (("m"."id" = "message_read_receipts"."message_id") AND ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view their own archived items" ON "public"."archived_messages" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own drafts" ON "public"."message_drafts" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own message state" ON "public"."message_user_state" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."activity_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_alert_queue" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_alert_queue_service_rw" ON "public"."admin_alert_queue" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "admins_can_delete_competitors" ON "public"."competitors" FOR DELETE USING ("public"."is_admin_user"());



CREATE POLICY "admins_can_delete_team_members" ON "public"."team_members" FOR DELETE USING ("public"."is_admin_user"());



CREATE POLICY "admins_can_delete_teams" ON "public"."teams" FOR DELETE USING ("public"."is_admin_user"());



CREATE POLICY "admins_can_insert_activity_logs" ON "public"."activity_logs" FOR INSERT WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "admins_can_insert_competitors" ON "public"."competitors" FOR INSERT WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "admins_can_insert_team_members" ON "public"."team_members" FOR INSERT WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "admins_can_insert_teams" ON "public"."teams" FOR INSERT WITH CHECK ("public"."is_admin_user"());



CREATE POLICY "admins_can_update_agreements" ON "public"."agreements" FOR UPDATE USING ("public"."is_admin_user"());



CREATE POLICY "admins_can_update_all_competitors" ON "public"."competitors" FOR UPDATE USING ("public"."is_admin_user"());



CREATE POLICY "admins_can_update_all_team_members" ON "public"."team_members" FOR UPDATE USING ("public"."is_admin_user"());



CREATE POLICY "admins_can_update_all_teams" ON "public"."teams" FOR UPDATE USING ("public"."is_admin_user"());



CREATE POLICY "admins_can_view_all_activity_logs" ON "public"."activity_logs" FOR SELECT USING ("public"."is_admin_user"());



CREATE POLICY "admins_can_view_all_agreements" ON "public"."agreements" FOR SELECT USING ("public"."is_admin_user"());



CREATE POLICY "admins_can_view_all_competitors" ON "public"."competitors" FOR SELECT USING ("public"."is_admin_user"());



CREATE POLICY "admins_can_view_all_profiles" ON "public"."profiles" FOR SELECT USING ("public"."is_admin_user"());



CREATE POLICY "admins_can_view_all_team_members" ON "public"."team_members" FOR SELECT USING ("public"."is_admin_user"());



CREATE POLICY "admins_can_view_all_teams" ON "public"."teams" FOR SELECT USING ("public"."is_admin_user"());



ALTER TABLE "public"."agreements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."alert_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "alert_log_insert_service" ON "public"."alert_log" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "alert_log_select_self" ON "public"."alert_log" FOR SELECT USING (("coach_id" = "auth"."uid"()));



CREATE POLICY "allow_all_access_for_now" ON "public"."game_platform_challenge_solves" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_access_for_now" ON "public"."game_platform_flash_ctf_events" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_access_for_now" ON "public"."game_platform_sync_state" USING (true) WITH CHECK (true);



CREATE POLICY "allow_read" ON "public"."nice_framework_work_roles" FOR SELECT USING (true);



CREATE POLICY "allow_read_nice_work_roles" ON "public"."nice_framework_work_roles" FOR SELECT USING (true);



ALTER TABLE "public"."archived_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_library_delete_admin" ON "public"."coach_library_documents" FOR DELETE TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



ALTER TABLE "public"."coach_library_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_library_insert_admin" ON "public"."coach_library_documents" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "coach_library_select" ON "public"."coach_library_documents" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "coach_library_update_admin" ON "public"."coach_library_documents" FOR UPDATE TO "authenticated" USING ("public"."is_admin"("auth"."uid"())) WITH CHECK ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "coaches_can_update_agreements" ON "public"."agreements" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."competitors" "c"
  WHERE (("c"."id" = "agreements"."competitor_id") AND ("c"."coach_id" = "auth"."uid"())))));



CREATE POLICY "coaches_can_update_own_competitors" ON "public"."competitors" FOR UPDATE USING (("coach_id" = "auth"."uid"()));



CREATE POLICY "coaches_can_update_own_teams" ON "public"."teams" FOR UPDATE USING (("coach_id" = "auth"."uid"()));



CREATE POLICY "coaches_can_view_agreements" ON "public"."agreements" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."competitors" "c"
  WHERE (("c"."id" = "agreements"."competitor_id") AND ("c"."coach_id" = "auth"."uid"())))));



CREATE POLICY "coaches_can_view_own_competitors" ON "public"."competitors" FOR SELECT USING (("coach_id" = "auth"."uid"()));



CREATE POLICY "coaches_can_view_own_teams" ON "public"."teams" FOR SELECT USING (("coach_id" = "auth"."uid"()));



ALTER TABLE "public"."competitors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversation_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversations_delete_admin" ON "public"."conversations" FOR DELETE USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "conversations_delete_allowed" ON "public"."conversations" FOR DELETE USING (("public"."is_admin"("auth"."uid"()) OR ("created_by" = "auth"."uid"())));



CREATE POLICY "conversations_insert_admin" ON "public"."conversations" FOR INSERT WITH CHECK ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "conversations_insert_allowed" ON "public"."conversations" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ("created_by" = "auth"."uid"())));



CREATE POLICY "conversations_select_admin" ON "public"."conversations" FOR SELECT USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "conversations_select_allowed" ON "public"."conversations" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "conversations"."id") AND ("cm"."user_id" = "auth"."uid"())))) OR "public"."is_admin"("auth"."uid"())));



CREATE POLICY "conversations_select_member" ON "public"."conversations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_members" "m"
  WHERE (("m"."conversation_id" = "conversations"."id") AND ("m"."user_id" = "auth"."uid"())))));



CREATE POLICY "conversations_update_admin" ON "public"."conversations" FOR UPDATE USING ("public"."is_admin"("auth"."uid"())) WITH CHECK ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "conversations_update_allowed" ON "public"."conversations" FOR UPDATE USING (("public"."is_admin"("auth"."uid"()) OR ("created_by" = "auth"."uid"())));



CREATE POLICY "convo_members_delete_admin" ON "public"."conversation_members" FOR DELETE USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "convo_members_insert_admin" ON "public"."conversation_members" FOR INSERT WITH CHECK ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "convo_members_select_admin" ON "public"."conversation_members" FOR SELECT USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "convo_members_select_self" ON "public"."conversation_members" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "convo_members_update_admin" ON "public"."conversation_members" FOR UPDATE USING ("public"."is_admin"("auth"."uid"())) WITH CHECK ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "convo_members_update_self_read" ON "public"."conversation_members" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK ((("user_id" = "auth"."uid"()) AND ("role" = ( SELECT "conversation_members_1"."role"
   FROM "public"."conversation_members" "conversation_members_1"
  WHERE (("conversation_members_1"."conversation_id" = "conversation_members_1"."conversation_id") AND ("conversation_members_1"."user_id" = "conversation_members_1"."user_id")))) AND (NOT ("muted_until" IS DISTINCT FROM ( SELECT "conversation_members_1"."muted_until"
   FROM "public"."conversation_members" "conversation_members_1"
  WHERE (("conversation_members_1"."conversation_id" = "conversation_members_1"."conversation_id") AND ("conversation_members_1"."user_id" = "conversation_members_1"."user_id")))))));



ALTER TABLE "public"."game_platform_challenge_solves" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_platform_flash_ctf_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_platform_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_platform_stats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_platform_stats_raw_data_backup" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_platform_sync_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_platform_sync_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_platform_sync_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_platform_teams" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gp_profiles_admin_read" ON "public"."game_platform_profiles" FOR SELECT TO "authenticated" USING ("public"."is_admin_user"());



CREATE POLICY "gp_profiles_coach_insert" ON "public"."game_platform_profiles" FOR INSERT WITH CHECK (("public"."is_admin_user"() OR (("coach_id" IS NOT NULL) AND ("coach_id" = "auth"."uid"())) OR (("competitor_id" IS NOT NULL) AND ("competitor_id" IN ( SELECT "competitors"."id"
   FROM "public"."competitors"
  WHERE ("competitors"."coach_id" = "auth"."uid"()))))));



CREATE POLICY "gp_profiles_coach_read" ON "public"."game_platform_profiles" FOR SELECT USING (((("coach_id" IS NOT NULL) AND ("coach_id" = "auth"."uid"())) OR (("competitor_id" IS NOT NULL) AND ("competitor_id" IN ( SELECT "competitors"."id"
   FROM "public"."competitors"
  WHERE ("competitors"."coach_id" = "auth"."uid"()))))));



CREATE POLICY "gp_profiles_coach_update" ON "public"."game_platform_profiles" FOR UPDATE USING (("public"."is_admin_user"() OR (("coach_id" IS NOT NULL) AND ("coach_id" = "auth"."uid"())) OR (("competitor_id" IS NOT NULL) AND ("competitor_id" IN ( SELECT "competitors"."id"
   FROM "public"."competitors"
  WHERE ("competitors"."coach_id" = "auth"."uid"())))))) WITH CHECK (("public"."is_admin_user"() OR (("coach_id" IS NOT NULL) AND ("coach_id" = "auth"."uid"())) OR (("competitor_id" IS NOT NULL) AND ("competitor_id" IN ( SELECT "competitors"."id"
   FROM "public"."competitors"
  WHERE ("competitors"."coach_id" = "auth"."uid"()))))));



CREATE POLICY "gp_sync_events_profile_link" ON "public"."game_platform_sync_events" FOR SELECT USING (("profile_id" IN ( SELECT "game_platform_profiles"."id"
   FROM "public"."game_platform_profiles"
  WHERE (("game_platform_profiles"."coach_id" = "auth"."uid"()) OR ("game_platform_profiles"."competitor_id" IN ( SELECT "competitors"."id"
           FROM "public"."competitors"
          WHERE ("competitors"."coach_id" = "auth"."uid"())))))));



CREATE POLICY "gp_teams_admin_read" ON "public"."game_platform_teams" FOR SELECT TO "authenticated" USING ("public"."is_admin_user"());



CREATE POLICY "gp_teams_coach_insert" ON "public"."game_platform_teams" FOR INSERT WITH CHECK (("public"."is_admin_user"() OR ("team_id" IN ( SELECT "teams"."id"
   FROM "public"."teams"
  WHERE ("teams"."coach_id" = "auth"."uid"())))));



CREATE POLICY "gp_teams_coach_read" ON "public"."game_platform_teams" FOR SELECT USING (("public"."is_admin_user"() OR ("team_id" IN ( SELECT "teams"."id"
   FROM "public"."teams"
  WHERE ("teams"."coach_id" = "auth"."uid"())))));



CREATE POLICY "gp_teams_coach_update" ON "public"."game_platform_teams" FOR UPDATE USING (("public"."is_admin_user"() OR ("team_id" IN ( SELECT "teams"."id"
   FROM "public"."teams"
  WHERE ("teams"."coach_id" = "auth"."uid"()))))) WITH CHECK (("public"."is_admin_user"() OR ("team_id" IN ( SELECT "teams"."id"
   FROM "public"."teams"
  WHERE ("teams"."coach_id" = "auth"."uid"())))));



ALTER TABLE "public"."job_queue" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "job_queue_admin_modify" ON "public"."job_queue" USING ((("auth"."role"() = 'authenticated'::"text") AND "public"."is_admin_user"())) WITH CHECK ((("auth"."role"() = 'authenticated'::"text") AND "public"."is_admin_user"()));



CREATE POLICY "job_queue_admin_read" ON "public"."job_queue" FOR SELECT USING ((("auth"."role"() = 'authenticated'::"text") AND "public"."is_admin_user"()));



CREATE POLICY "job_queue_service_role_full" ON "public"."job_queue" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."job_queue_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "job_queue_settings_admin" ON "public"."job_queue_settings" USING ((("auth"."role"() = 'authenticated'::"text") AND "public"."is_admin_user"())) WITH CHECK ((("auth"."role"() = 'authenticated'::"text") AND "public"."is_admin_user"()));



CREATE POLICY "job_queue_settings_service_role" ON "public"."job_queue_settings" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."job_worker_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "job_worker_runs_admin_read" ON "public"."job_worker_runs" FOR SELECT USING ((("auth"."role"() = 'authenticated'::"text") AND "public"."is_admin_user"()));



CREATE POLICY "job_worker_runs_service_role_full" ON "public"."job_worker_runs" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."message_drafts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_read_receipts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_user_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_delete_admin" ON "public"."messages" FOR DELETE USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "messages_insert_allowed" ON "public"."messages" FOR INSERT WITH CHECK (("public"."is_admin"("auth"."uid"()) OR ((EXISTS ( SELECT 1
   FROM "public"."conversation_members" "m"
  WHERE (("m"."conversation_id" = "messages"."conversation_id") AND ("m"."user_id" = "auth"."uid"()) AND (("m"."muted_until" IS NULL) OR ("m"."muted_until" < "now"()))))) AND (( SELECT "c"."type"
   FROM "public"."conversations" "c"
  WHERE ("c"."id" = "messages"."conversation_id")) = ANY (ARRAY['dm'::"text", 'group'::"text"])))));



CREATE POLICY "messages_select_admin" ON "public"."messages" FOR SELECT USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "messages_select_member" ON "public"."messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_members" "m"
  WHERE (("m"."conversation_id" = "messages"."conversation_id") AND ("m"."user_id" = "auth"."uid"())))));



CREATE POLICY "messages_update_admin" ON "public"."messages" FOR UPDATE USING ("public"."is_admin"("auth"."uid"())) WITH CHECK ("public"."is_admin"("auth"."uid"()));



ALTER TABLE "public"."nice_framework_work_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_role_full_access" ON "public"."agreements" USING (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."system_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."conversation_members";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON TYPE "public"."completion_source" TO "authenticated";



































































































































































































































































































GRANT ALL ON FUNCTION "public"."archive_all_messages_in_conversation"("p_conversation_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."archive_all_messages_in_conversation"("p_conversation_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."archive_all_messages_in_conversation"("p_conversation_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."archive_message_user"("p_message_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."archive_message_user"("p_message_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."archive_message_user"("p_message_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_team_size"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_team_size"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_team_size"() TO "service_role";



GRANT ALL ON FUNCTION "public"."count_unread_by_receipts"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."count_unread_by_receipts"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_unread_by_receipts"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."count_unread_messages"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."count_unread_messages"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_unread_messages"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_announcement_and_broadcast"("p_body" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_announcement_and_broadcast"("p_body" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_announcement_and_broadcast"("p_body" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_announcement_and_broadcast"("p_title" "text", "p_body" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_announcement_and_broadcast"("p_title" "text", "p_body" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_announcement_and_broadcast"("p_title" "text", "p_body" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_cron_job"("job_name" "text", "job_schedule" "text", "task_type" "text", "task_payload" "jsonb", "max_attempts" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."create_cron_job"("job_name" "text", "job_schedule" "text", "task_type" "text", "task_payload" "jsonb", "max_attempts" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_cron_job"("job_name" "text", "job_schedule" "text", "task_type" "text", "task_payload" "jsonb", "max_attempts" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_dm_conversation"("p_other_user_id" "uuid", "p_title" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_dm_conversation"("p_other_user_id" "uuid", "p_title" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_dm_conversation"("p_other_user_id" "uuid", "p_title" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_group_conversation"("p_user_ids" "uuid"[], "p_title" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_group_conversation"("p_user_ids" "uuid"[], "p_title" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_group_conversation"("p_user_ids" "uuid"[], "p_title" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_or_get_dm"("p_other_user_id" "uuid", "p_title" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_or_get_dm"("p_other_user_id" "uuid", "p_title" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_or_get_dm"("p_other_user_id" "uuid", "p_title" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_same_conversation"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_same_conversation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_same_conversation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fetch_unread_alert_candidates"("p_window_minutes" integer, "p_coach_id" "uuid", "p_force" boolean, "p_roles" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."fetch_unread_alert_candidates"("p_window_minutes" integer, "p_coach_id" "uuid", "p_force" boolean, "p_roles" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fetch_unread_alert_candidates"("p_window_minutes" integer, "p_coach_id" "uuid", "p_force" boolean, "p_roles" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_profile_update_token"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_profile_update_token"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_profile_update_token"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_archived_items"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_archived_items"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_archived_items"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_conversation_messages"("p_conversation_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_conversation_messages"("p_conversation_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_conversation_messages"("p_conversation_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_conversation_messages_with_state"("p_conversation_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_conversation_messages_with_state"("p_conversation_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_conversation_messages_with_state"("p_conversation_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_conversation_summary"("p_conversation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_conversation_summary"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_conversation_summary"("p_conversation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_cron_job_runs"("limit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_cron_job_runs"("limit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_cron_job_runs"("limit_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_cron_jobs"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_cron_jobs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_cron_jobs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_dashboard_category_totals"("p_synced_user_ids" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_dashboard_category_totals"("p_synced_user_ids" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_category_totals"("p_synced_user_ids" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_message_read_status"("p_message_ids" bigint[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_message_read_status"("p_message_ids" bigint[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_message_read_status"("p_message_ids" bigint[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_message_user_state"("p_message_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_message_user_state"("p_message_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_message_user_state"("p_message_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_recent_messages_for_user"("p_user_id" "uuid", "p_limit_per_conversation" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_recent_messages_for_user"("p_user_id" "uuid", "p_limit_per_conversation" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_recent_messages_for_user"("p_user_id" "uuid", "p_limit_per_conversation" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_recurring_jobs_to_enqueue"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_recurring_jobs_to_enqueue"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_recurring_jobs_to_enqueue"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_thread_messages"("p_thread_root_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_thread_messages"("p_thread_root_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_thread_messages"("p_thread_root_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_unread_counts"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_unread_counts"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_unread_counts"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"("uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"("uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"("uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_user"() TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."job_queue" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."job_queue" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."job_queue" TO "service_role";



GRANT ALL ON FUNCTION "public"."job_queue_claim"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."job_queue_claim"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."job_queue_claim"("p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."job_queue_cleanup"("p_max_age" interval) TO "anon";
GRANT ALL ON FUNCTION "public"."job_queue_cleanup"("p_max_age" interval) TO "authenticated";
GRANT ALL ON FUNCTION "public"."job_queue_cleanup"("p_max_age" interval) TO "service_role";



GRANT ALL ON FUNCTION "public"."job_queue_enqueue"("p_task_type" "text", "p_payload" "jsonb", "p_run_at" timestamp with time zone, "p_max_attempts" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."job_queue_enqueue"("p_task_type" "text", "p_payload" "jsonb", "p_run_at" timestamp with time zone, "p_max_attempts" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."job_queue_enqueue"("p_task_type" "text", "p_payload" "jsonb", "p_run_at" timestamp with time zone, "p_max_attempts" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."job_queue_health"() TO "anon";
GRANT ALL ON FUNCTION "public"."job_queue_health"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."job_queue_health"() TO "service_role";



GRANT ALL ON FUNCTION "public"."job_queue_mark_failed"("p_job_id" "uuid", "p_error" "text", "p_retry_in_ms" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."job_queue_mark_failed"("p_job_id" "uuid", "p_error" "text", "p_retry_in_ms" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."job_queue_mark_failed"("p_job_id" "uuid", "p_error" "text", "p_retry_in_ms" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."job_queue_mark_failed"("p_id" "uuid", "p_error" "text", "p_retry_in" interval) TO "anon";
GRANT ALL ON FUNCTION "public"."job_queue_mark_failed"("p_id" "uuid", "p_error" "text", "p_retry_in" interval) TO "authenticated";
GRANT ALL ON FUNCTION "public"."job_queue_mark_failed"("p_id" "uuid", "p_error" "text", "p_retry_in" interval) TO "service_role";



GRANT ALL ON FUNCTION "public"."job_queue_mark_succeeded"("p_job_id" "uuid", "p_output" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."job_queue_mark_succeeded"("p_job_id" "uuid", "p_output" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."job_queue_mark_succeeded"("p_job_id" "uuid", "p_output" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."list_admins_minimal"() TO "anon";
GRANT ALL ON FUNCTION "public"."list_admins_minimal"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_admins_minimal"() TO "service_role";



GRANT ALL ON FUNCTION "public"."list_coaches_minimal"() TO "anon";
GRANT ALL ON FUNCTION "public"."list_coaches_minimal"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_coaches_minimal"() TO "service_role";



GRANT ALL ON FUNCTION "public"."list_conversations_enriched"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."list_conversations_enriched"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_conversations_enriched"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."list_conversations_summary"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."list_conversations_summary"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_conversations_summary"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."list_conversations_with_unread"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."list_conversations_with_unread"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_conversations_with_unread"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."list_conversations_with_user_state"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."list_conversations_with_user_state"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_conversations_with_user_state"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."list_members_with_profile"("p_conversation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."list_members_with_profile"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_members_with_profile"("p_conversation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."list_messages_with_sender"("p_conversation_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."list_messages_with_sender"("p_conversation_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_messages_with_sender"("p_conversation_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."list_messages_with_sender_v2"("p_conversation_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."list_messages_with_sender_v2"("p_conversation_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_messages_with_sender_v2"("p_conversation_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."list_threads"("p_conversation_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."list_threads"("p_conversation_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_threads"("p_conversation_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."list_threads_for_user"("p_user_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."list_threads_for_user"("p_user_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_threads_for_user"("p_user_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."list_users_minimal"() TO "anon";
GRANT ALL ON FUNCTION "public"."list_users_minimal"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_users_minimal"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_conversation_read"("p_conversation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_conversation_read"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_conversation_read"("p_conversation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_conversation_read_v2"("p_conversation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_conversation_read_v2"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_conversation_read_v2"("p_conversation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_messages_read"("p_message_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."mark_messages_read"("p_message_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_messages_read"("p_message_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_recurring_job_enqueued"("job_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_recurring_job_enqueued"("job_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_recurring_job_enqueued"("job_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_unread_alert_sent"("p_coach_id" "uuid", "p_unread_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."mark_unread_alert_sent"("p_coach_id" "uuid", "p_unread_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_unread_alert_sent"("p_coach_id" "uuid", "p_unread_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."post_private_reply"("p_conversation_id" "uuid", "p_body" "text", "p_recipient" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."post_private_reply"("p_conversation_id" "uuid", "p_body" "text", "p_recipient" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."post_private_reply"("p_conversation_id" "uuid", "p_body" "text", "p_recipient" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."post_private_reply"("p_conversation_id" "uuid", "p_body" "text", "p_recipient" "uuid", "p_parent_message_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."post_private_reply"("p_conversation_id" "uuid", "p_body" "text", "p_recipient" "uuid", "p_parent_message_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."post_private_reply"("p_conversation_id" "uuid", "p_body" "text", "p_recipient" "uuid", "p_parent_message_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_thread_roots"("p_conversation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_thread_roots"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_thread_roots"("p_conversation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_thread_stats"("p_conversation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_thread_stats"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_thread_stats"("p_conversation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."search_drafts_for_user"("p_user_id" "uuid", "p_query" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."search_drafts_for_user"("p_user_id" "uuid", "p_query" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_drafts_for_user"("p_user_id" "uuid", "p_query" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."search_message_items"("p_user_id" "uuid", "p_query" "text", "p_archived" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."search_message_items"("p_user_id" "uuid", "p_query" "text", "p_archived" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_message_items"("p_user_id" "uuid", "p_query" "text", "p_archived" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_job_queue_settings_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_job_queue_settings_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_job_queue_settings_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_job_queue_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_job_queue_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_job_queue_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_profile_update_token_with_expiry"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_profile_update_token_with_expiry"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_profile_update_token_with_expiry"() TO "service_role";



GRANT ALL ON FUNCTION "public"."toggle_cron_job"("job_name" "text", "new_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."toggle_cron_job"("job_name" "text", "new_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."toggle_cron_job"("job_name" "text", "new_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."toggle_message_flag"("p_message_id" "uuid", "p_flagged" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."toggle_message_flag"("p_message_id" "uuid", "p_flagged" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."toggle_message_flag"("p_message_id" "uuid", "p_flagged" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."unarchive_message_user"("p_message_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."unarchive_message_user"("p_message_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unarchive_message_user"("p_message_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_cron_schedule"("job_name" "text", "new_schedule" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_cron_schedule"("job_name" "text", "new_schedule" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_cron_schedule"("job_name" "text", "new_schedule" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_game_platform_sync_state_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_game_platform_sync_state_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_game_platform_sync_state_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_message_drafts_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_message_drafts_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_message_drafts_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_message_user_state_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_message_user_state_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_message_user_state_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_thread_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_thread_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_thread_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


















GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."activity_logs" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."activity_logs" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."activity_logs" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."admin_alert_queue" TO "anon";
GRANT ALL ON TABLE "public"."admin_alert_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_alert_queue" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."agreements" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."agreements" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."agreements" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."alert_log" TO "anon";
GRANT ALL ON TABLE "public"."alert_log" TO "authenticated";
GRANT ALL ON TABLE "public"."alert_log" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."archived_messages" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."archived_messages" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."archived_messages" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."competitors" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."competitors" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."competitors" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."coach_competitor_counts" TO "anon";
GRANT ALL ON TABLE "public"."coach_competitor_counts" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_competitor_counts" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."coach_library_documents" TO "authenticated";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."team_members" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."team_members" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."team_members" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."teams" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."teams" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."teams" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."comp_team_view" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."comp_team_view" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."comp_team_view" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."conversation_members" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."conversation_members" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."conversation_members" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."conversations" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."conversations" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."conversations" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."game_platform_challenge_solves" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."game_platform_challenge_solves" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."game_platform_challenge_solves" TO "service_role";



GRANT ALL ON SEQUENCE "public"."game_platform_challenge_solves_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."game_platform_challenge_solves_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."game_platform_challenge_solves_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."game_platform_flash_ctf_events" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."game_platform_flash_ctf_events" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."game_platform_flash_ctf_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."game_platform_flash_ctf_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."game_platform_flash_ctf_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."game_platform_flash_ctf_events_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."game_platform_profiles" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."game_platform_profiles" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."game_platform_profiles" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."game_platform_stats" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."game_platform_stats" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."game_platform_stats" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."game_platform_stats_raw_data_backup" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."game_platform_stats_raw_data_backup" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."game_platform_stats_raw_data_backup" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."game_platform_sync_events" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."game_platform_sync_events" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."game_platform_sync_events" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."game_platform_sync_runs" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."game_platform_sync_runs" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."game_platform_sync_runs" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."game_platform_sync_state" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."game_platform_sync_state" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."game_platform_sync_state" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."game_platform_teams" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."game_platform_teams" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."game_platform_teams" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."job_queue_settings" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."job_queue_settings" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."job_queue_settings" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."job_worker_runs" TO "anon";
GRANT ALL ON TABLE "public"."job_worker_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."job_worker_runs" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."message_drafts" TO "anon";
GRANT ALL ON TABLE "public"."message_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."message_drafts" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."message_read_receipts" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."message_read_receipts" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."message_read_receipts" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."message_user_state" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."message_user_state" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."message_user_state" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."messages" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."messages" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."messages" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."nice_framework_work_roles" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."nice_framework_work_roles" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."nice_framework_work_roles" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."profiles" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."profiles" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."profiles" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."release_eligible_competitors" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."release_eligible_competitors" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."release_eligible_competitors" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."system_config" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."system_config" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."system_config" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."v_conversation_members_with_profile" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."v_conversation_members_with_profile" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."v_conversation_members_with_profile" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."v_messages_with_sender" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."v_messages_with_sender" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."v_messages_with_sender" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































