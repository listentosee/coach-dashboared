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
  -- Only allow admins to call this
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Access denied';
  end if;

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

-- Grant execute permission to authenticated users (admin check is inside function)
grant execute on function public.create_cron_job(text, text, text, jsonb, integer) to authenticated;
