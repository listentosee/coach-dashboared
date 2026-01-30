alter table if exists public.game_platform_sync_state
  add column if not exists last_login_at timestamp with time zone;

alter table if exists public.game_platform_flash_ctf_events
  add column if not exists max_points_possible integer;
