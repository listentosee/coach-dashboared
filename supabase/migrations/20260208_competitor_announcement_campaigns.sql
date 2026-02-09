-- Competitor announcement email campaigns
-- Allows admins to send bulk email announcements to competitors

-- 1. Campaigns table
create table if not exists public.competitor_announcement_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  body_markdown text not null,
  body_html text not null,
  created_by uuid not null references auth.users(id),
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- 2. Recipients table
create table if not exists public.competitor_announcement_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.competitor_announcement_campaigns(id),
  competitor_id uuid not null references public.competitors(id),
  email text not null,
  status text not null default 'queued' check (status in ('queued','delivered','bounced','dropped','blocked','skipped')),
  skip_reason text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Add game_platform_onboarding_email to competitors
alter table public.competitors add column if not exists game_platform_onboarding_email text;

-- 4. Backfill game_platform_onboarding_email from personal/school email
update public.competitors
set game_platform_onboarding_email = coalesce(email_personal, email_school)
where game_platform_id is not null
  and game_platform_onboarding_email is null;

-- 5. Derived campaign stats function
create or replace function public.get_campaign_stats(p_campaign_id uuid)
returns table (
  total_recipients bigint,
  total_queued bigint,
  total_delivered bigint,
  total_bounced bigint,
  total_dropped bigint,
  total_blocked bigint,
  total_skipped bigint
)
language sql stable
security definer
set search_path = 'public'
as $$
  select
    count(*)::bigint,
    count(*) filter (where status = 'queued')::bigint,
    count(*) filter (where status = 'delivered')::bigint,
    count(*) filter (where status = 'bounced')::bigint,
    count(*) filter (where status = 'dropped')::bigint,
    count(*) filter (where status = 'blocked')::bigint,
    count(*) filter (where status = 'skipped')::bigint
  from competitor_announcement_recipients
  where campaign_id = p_campaign_id;
$$;

-- 6. Indexes
create index if not exists idx_announcement_recipients_campaign_id
  on public.competitor_announcement_recipients (campaign_id);

create index if not exists idx_announcement_recipients_campaign_status
  on public.competitor_announcement_recipients (campaign_id, status);

-- 7. Enable RLS
alter table public.competitor_announcement_campaigns enable row level security;
alter table public.competitor_announcement_recipients enable row level security;

-- 8. RLS policies — admin read access (authenticated users with admin role)
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'announcement_campaigns_admin_read' and tablename = 'competitor_announcement_campaigns') then
    create policy announcement_campaigns_admin_read
      on public.competitor_announcement_campaigns
      for select
      using ((auth.role() = 'authenticated') and public.is_admin_user());
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'announcement_recipients_admin_read' and tablename = 'competitor_announcement_recipients') then
    create policy announcement_recipients_admin_read
      on public.competitor_announcement_recipients
      for select
      using ((auth.role() = 'authenticated') and public.is_admin_user());
  end if;
end $$;

-- 9. RLS policies — service role full access (used by API routes)
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'announcement_campaigns_service_role_full' and tablename = 'competitor_announcement_campaigns') then
    create policy announcement_campaigns_service_role_full
      on public.competitor_announcement_campaigns
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'announcement_recipients_service_role_full' and tablename = 'competitor_announcement_recipients') then
    create policy announcement_recipients_service_role_full
      on public.competitor_announcement_recipients
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;
