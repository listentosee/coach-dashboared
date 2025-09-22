-- Job queue infrastructure for orchestrated sync tasks
set local search_path = public;

create table if not exists job_queue (
  id uuid primary key default gen_random_uuid(),
  task_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  run_at timestamptz not null default now(),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  last_error text,
  output jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint job_queue_status_check check (status in ('pending','running','succeeded','failed','cancelled')),
  constraint job_queue_attempts_check check (attempts >= 0 and max_attempts >= 1)
);

create index if not exists idx_job_queue_status_run_at on job_queue (status, run_at);
create index if not exists idx_job_queue_task_type on job_queue (task_type);

create or replace function public.set_job_queue_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists job_queue_set_updated_at on public.job_queue;
create trigger job_queue_set_updated_at
before update on public.job_queue
for each row
execute function public.set_job_queue_updated_at();

create table if not exists public.job_queue_settings (
  id int primary key default 1,
  processing_enabled boolean not null default true,
  paused_reason text,
  updated_at timestamptz not null default now(),
  constraint job_queue_settings_singleton check (id = 1)
);

insert into public.job_queue_settings (id)
values (1)
on conflict (id) do nothing;

create or replace function public.set_job_queue_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists job_queue_settings_set_updated_at on public.job_queue_settings;
create trigger job_queue_settings_set_updated_at
before update on public.job_queue_settings
for each row
execute function public.set_job_queue_settings_updated_at();

alter table public.job_queue_settings enable row level security;

create policy job_queue_settings_service_role
  on public.job_queue_settings
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy job_queue_settings_admin
  on public.job_queue_settings
  for all
  using (auth.role() = 'authenticated' and is_admin_user())
  with check (auth.role() = 'authenticated' and is_admin_user());

create or replace function public.job_queue_enqueue(
  p_task_type text,
  p_payload jsonb default '{}'::jsonb,
  p_run_at timestamptz default now(),
  p_max_attempts integer default 5
)
returns job_queue
language plpgsql
as $$
declare
  inserted job_queue;
begin
  insert into public.job_queue (task_type, payload, run_at, max_attempts)
  values (p_task_type, coalesce(p_payload, '{}'::jsonb), coalesce(p_run_at, now()), greatest(p_max_attempts, 1))
  returning * into inserted;
  return inserted;
end;
$$;

create or replace function public.job_queue_claim(
  p_limit integer default 1
)
returns setof job_queue
language plpgsql
as $$
begin
  return query
  with next_jobs as (
    select id
    from public.job_queue
    where status = 'pending'
      and run_at <= now()
    order by run_at asc
    for update skip locked
    limit greatest(p_limit, 1)
  )
  update public.job_queue
     set status = 'running',
         attempts = attempts + 1,
         updated_at = now()
   where id in (select id from next_jobs)
   returning *;
end;
$$;

create or replace function public.job_queue_mark_succeeded(
  p_id uuid,
  p_output jsonb default null
)
returns job_queue
language plpgsql
as $$
declare
  updated job_queue;
begin
  update public.job_queue
     set status = 'succeeded',
         output = coalesce(p_output, output),
         last_error = null,
         completed_at = now(),
         updated_at = now()
   where id = p_id
   returning * into updated;
  return updated;
end;
$$;

create or replace function public.job_queue_mark_failed(
  p_id uuid,
  p_error text,
  p_retry_in interval default interval '5 minutes'
)
returns job_queue
language plpgsql
as $$
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

create or replace function public.job_queue_cleanup(
  p_max_age interval default interval '14 days'
)
returns integer
language plpgsql
as $$
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

create or replace function public.job_queue_health()
returns jsonb
language plpgsql
security definer
set search_path = public, cron, net, extensions
as $$
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
        'created', created,
        'status_code', status_code,
        'error', error_msg,
        'content', substring(content for 200)
      ) order by created desc), '[]'::jsonb)
      from (
        select * from net._http_response order by created desc limit 10
      ) r
    ),
    'latestRuns', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'jobname', j.jobname,
        'start_time', d.start_time,
        'end_time', d.end_time,
        'status', d.status,
        'message', d.return_message
      ) order by d.start_time desc), '[]'::jsonb)
      from cron.job_run_details d
      join cron.job j on j.jobid = d.jobid
      order by d.start_time desc
      limit 10
    )
  ) into result;

  return coalesce(result, '{}'::jsonb);
end;
$$;
