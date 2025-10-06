-- Functions for managing pg_cron jobs from Admin Tools UI
-- These are security definer functions that allow admins to manage cron jobs

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
  -- Only allow admins to call this
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Access denied';
  end if;

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
  -- Only allow admins to call this
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Access denied';
  end if;

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
  -- Only allow admins to call this
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Access denied';
  end if;

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
  -- Only allow admins to call this
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Access denied';
  end if;

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

-- Grant execute permissions to authenticated users (admin check is inside functions)
grant execute on function public.get_cron_jobs() to authenticated;
grant execute on function public.get_cron_job_runs(integer) to authenticated;
grant execute on function public.toggle_cron_job(text, boolean) to authenticated;
grant execute on function public.update_cron_schedule(text, text) to authenticated;
