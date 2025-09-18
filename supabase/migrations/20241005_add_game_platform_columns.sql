-- Game Platform integration support columns
-- This script is intended for manual execution against the production Supabase database.
-- Apply within a transaction to keep schema changes atomic.

begin;

-- Competitor mapping + telemetry
alter table public.competitors
  add column if not exists game_platform_id text,
  add column if not exists game_platform_synced_at timestamptz,
  add column if not exists game_platform_sync_error text,
  add column if not exists syned_school_id text,
  add column if not exists syned_region_id text,
  add column if not exists syned_coach_user_id text;

create unique index if not exists idx_competitors_game_platform_id
  on public.competitors (game_platform_id)
  where game_platform_id is not null;

-- Team-level mapping + coach linkage
alter table public.teams
  add column if not exists game_platform_id text,
  add column if not exists game_platform_synced_at timestamptz,
  add column if not exists game_platform_sync_error text,
  add column if not exists affiliation text,
  add column if not exists syned_coach_user_id text,
  add column if not exists coach_game_platform_id text;

create unique index if not exists idx_teams_game_platform_id
  on public.teams (game_platform_id)
  where game_platform_id is not null;

-- Member sync breadcrumbs
alter table public.team_members
  add column if not exists game_platform_synced_at timestamptz,
  add column if not exists game_platform_sync_error text;

-- Coach mappings for reuse across teams
alter table public.profiles
  add column if not exists game_platform_user_id text,
  add column if not exists game_platform_last_synced_at timestamptz;

create unique index if not exists idx_profiles_game_platform_user_id
  on public.profiles (game_platform_user_id)
  where game_platform_user_id is not null;

commit;
