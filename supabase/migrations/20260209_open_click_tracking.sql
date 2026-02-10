-- Add open/click tracking to competitor announcement recipients

alter table public.competitor_announcement_recipients
  add column if not exists opened_at timestamptz,
  add column if not exists clicked_at timestamptz;

-- Drop existing function first (return type is changing from 7 to 9 columns)
drop function if exists public.get_campaign_stats(uuid);

-- Recreate get_campaign_stats with open/click counts
create or replace function public.get_campaign_stats(p_campaign_id uuid)
returns table (
  total_recipients bigint,
  total_queued bigint,
  total_delivered bigint,
  total_bounced bigint,
  total_dropped bigint,
  total_blocked bigint,
  total_skipped bigint,
  total_opened bigint,
  total_clicked bigint
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
    count(*) filter (where status = 'skipped')::bigint,
    count(*) filter (where opened_at is not null)::bigint,
    count(*) filter (where clicked_at is not null)::bigint
  from competitor_announcement_recipients
  where campaign_id = p_campaign_id;
$$;
