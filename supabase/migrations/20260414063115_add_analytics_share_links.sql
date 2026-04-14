create table if not exists public.analytics_share_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  report_type text not null default 'analytics_donor',
  expires_at timestamptz,
  max_uses integer,
  use_count integer not null default 0,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_analytics_share_links_token
  on public.analytics_share_links (token);

create index if not exists idx_analytics_share_links_report_type
  on public.analytics_share_links (report_type);

alter table public.analytics_share_links enable row level security;

comment on table public.analytics_share_links is 'Expirable, optionally use-limited share links for donor-safe analytics pages.';
