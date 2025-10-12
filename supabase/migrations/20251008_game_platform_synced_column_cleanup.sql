-- Align MetaCTF identifier columns with `synced_*` naming across game platform tables.

-- Profiles table: rename column and unique constraint.
ALTER TABLE public.game_platform_profiles
  RENAME COLUMN syned_user_id TO synced_user_id;

ALTER TABLE public.game_platform_profiles
  RENAME CONSTRAINT game_platform_profiles_syned_user_id_key
  TO game_platform_profiles_synced_user_id_key;

-- Teams table: rename column and supporting index for MetaCTF team mapping.
ALTER TABLE public.game_platform_teams
  RENAME COLUMN syned_team_id TO synced_team_id;

ALTER INDEX game_platform_teams_syned_idx
  RENAME TO game_platform_teams_synced_idx;

-- Challenge solves: rename user/team columns plus unique constraint.
ALTER TABLE public.game_platform_challenge_solves
  RENAME COLUMN syned_user_id TO synced_user_id;

ALTER TABLE public.game_platform_challenge_solves
  RENAME COLUMN syned_team_id TO synced_team_id;

ALTER TABLE public.game_platform_challenge_solves
  RENAME CONSTRAINT game_platform_challenge_solve_syned_user_id_challenge_solve_key
  TO game_platform_challenge_solves_synced_user_solve_key;

-- Flash CTF events table: rename MetaCTF user column and constraint.
ALTER TABLE public.game_platform_flash_ctf_events
  RENAME COLUMN syned_user_id TO synced_user_id;

ALTER TABLE public.game_platform_flash_ctf_events
  RENAME CONSTRAINT game_platform_flash_ctf_events_syned_user_id_event_id_key
  TO game_platform_flash_ctf_events_synced_user_event_key;

-- Sync state: rename primary identifier column.
ALTER TABLE public.game_platform_sync_state
  RENAME COLUMN syned_user_id TO synced_user_id;
