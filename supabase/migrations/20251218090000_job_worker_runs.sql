create table if not exists public.job_worker_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  source text not null,
  http_method text,
  user_agent text,
  status text,
  processed integer not null default 0,
  succeeded integer,
  failed integer,
  message text,
  error_message text,
  results jsonb
);

create index if not exists idx_job_worker_runs_started_at_desc on public.job_worker_runs (started_at desc);

alter table public.job_worker_runs enable row level security;

create policy job_worker_runs_admin_read
  on public.job_worker_runs
  for select
  using ((auth.role() = 'authenticated') and public.is_admin_user());

create policy job_worker_runs_service_role_full
  on public.job_worker_runs
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

