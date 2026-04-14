create table if not exists public.competitor_certificates (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  student_id text,
  certificate_year integer not null,
  storage_path text,
  claim_token text unique,
  emailed_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  survey_completed_at timestamptz,
  downloaded_at timestamptz,
  download_count integer not null default 0,
  fillout_submission_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competitor_certificates_competitor_year_key unique (competitor_id, certificate_year)
);

create index if not exists idx_competitor_certificates_claim_token
  on public.competitor_certificates (claim_token);

create index if not exists idx_competitor_certificates_competitor_id
  on public.competitor_certificates (competitor_id);

drop trigger if exists update_competitor_certificates_updated_at on public.competitor_certificates;
create trigger update_competitor_certificates_updated_at
before update on public.competitor_certificates
for each row execute function public.update_updated_at_column();

alter table public.competitor_certificates enable row level security;

create table if not exists public.survey_results (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('competitor', 'coach')),
  competitor_id uuid references public.competitors(id) on delete set null,
  coach_profile_id uuid references public.profiles(id) on delete set null,
  competitor_certificate_id uuid references public.competitor_certificates(id) on delete set null,
  fillout_submission_id text not null unique,
  fillout_form_id text,
  submitted_at timestamptz not null default now(),
  results_jsonb jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_survey_results_type
  on public.survey_results (type);

create index if not exists idx_survey_results_competitor_id
  on public.survey_results (competitor_id);

create index if not exists idx_survey_results_coach_profile_id
  on public.survey_results (coach_profile_id);

create index if not exists idx_survey_results_certificate_id
  on public.survey_results (competitor_certificate_id);

alter table public.survey_results enable row level security;

comment on table public.competitor_certificates is 'Certificate delivery and claim state for competition participants.';
comment on table public.survey_results is 'Shared Fillout survey submission storage for competitor certificate surveys and coach feedback.';
comment on column public.survey_results.results_jsonb is 'Stored Fillout submission payload for reporting and debugging.';
