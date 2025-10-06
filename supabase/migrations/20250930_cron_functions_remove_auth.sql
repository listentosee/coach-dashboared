-- Remove auth checks from cron management functions
-- Auth is now enforced at the API route level before calling these functions with service role

-- Function to get all cron jobs with their details
create or replace function public.get_cron_jobs()
returns table (
  jobid bigint,
  jobname text,
  schedule text,
  command text,
  nodename text,
  nodeport integer,
  database text,
  username text,
  active boolean
)
language plpgsql
security definer
set search_path = public, cron
as $$
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

-- Function to get recent cron job execution history
create or replace function public.get_cron_job_runs(limit_count integer default 50)
returns table (
  runid bigint,
  jobid bigint,
  jobname text,
  job_pid integer,
  database text,
  username text,
  command text,
  status text,
  return_message text,
  start_time timestamptz,
  end_time timestamptz
)
language plpgsql
security definer
set search_path = public, cron
as $$
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

-- Function to toggle a cron job's active status
create or replace function public.toggle_cron_job(
  job_name text,
  new_active boolean
)
returns void
language plpgsql
security definer
set search_path = public, cron
as $$
begin
  update cron.job
  set active = new_active
  where jobname = job_name;

  if not found then
    raise exception 'Cron job not found: %', job_name;
  end if;
end;
$$;

-- Function to update a cron job's schedule
create or replace function public.update_cron_schedule(
  job_name text,
  new_schedule text
)
returns void
language plpgsql
security definer
set search_path = public, cron
as $$
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

-- Function to create a new cron job that enqueues tasks into job_queue
create or replace function public.create_cron_job(
  job_name text,
  job_schedule text,
  task_type text,
  task_payload jsonb default '{}'::jsonb,
  max_attempts integer default 3
)
returns bigint
language plpgsql
security definer
set search_path = public, cron
as $$
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
$$;

-- Grant necessary permissions
-- These functions run as the definer (postgres role) which has access to cron schema
-- But we need to ensure they're owned by postgres
alter function public.get_cron_jobs() owner to postgres;
alter function public.get_cron_job_runs(integer) owner to postgres;
alter function public.toggle_cron_job(text, boolean) owner to postgres;
alter function public.update_cron_schedule(text, text) owner to postgres;
alter function public.create_cron_job(text, text, text, jsonb, integer) owner to postgres;
