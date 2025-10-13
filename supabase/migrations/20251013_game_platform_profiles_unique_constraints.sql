-- Ensure game_platform_profiles supports upserts on competitor_id and coach_id
-- by backing the ON CONFLICT targets with real unique constraints instead of
-- partial indexes. Partial unique indexes cannot be referenced via the column
-- based ON CONFLICT syntax that PostgREST / Supabase uses.

BEGIN;

-- Clean up legacy partial unique indexes if they exist.
DROP INDEX IF EXISTS public.game_platform_profiles_coach_idx;
DROP INDEX IF EXISTS public.game_platform_profiles_competitor_idx;

-- Drop any stale constraints before recreating them.
ALTER TABLE public.game_platform_profiles
  DROP CONSTRAINT IF EXISTS game_platform_profiles_coach_id_key;

ALTER TABLE public.game_platform_profiles
  DROP CONSTRAINT IF EXISTS game_platform_profiles_competitor_id_key;

-- Add true unique constraints that ON CONFLICT (coach_id|competitor_id) can target.
ALTER TABLE public.game_platform_profiles
  ADD CONSTRAINT game_platform_profiles_coach_id_key UNIQUE (coach_id);

ALTER TABLE public.game_platform_profiles
  ADD CONSTRAINT game_platform_profiles_competitor_id_key UNIQUE (competitor_id);

-- Allow coaches (and admins) to write their own mapping rows while keeping RLS enabled.
DROP POLICY IF EXISTS gp_profiles_coach_insert ON public.game_platform_profiles;
DROP POLICY IF EXISTS gp_profiles_coach_update ON public.game_platform_profiles;

CREATE POLICY gp_profiles_coach_insert
  ON public.game_platform_profiles
  FOR INSERT
  WITH CHECK (
    public.is_admin_user()
    OR (coach_id IS NOT NULL AND coach_id = auth.uid())
    OR (
      competitor_id IS NOT NULL
      AND competitor_id IN (
        SELECT id FROM public.competitors WHERE coach_id = auth.uid()
      )
    )
  );

CREATE POLICY gp_profiles_coach_update
  ON public.game_platform_profiles
  FOR UPDATE
  USING (
    public.is_admin_user()
    OR (coach_id IS NOT NULL AND coach_id = auth.uid())
    OR (
      competitor_id IS NOT NULL
      AND competitor_id IN (
        SELECT id FROM public.competitors WHERE coach_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    public.is_admin_user()
    OR (coach_id IS NOT NULL AND coach_id = auth.uid())
    OR (
      competitor_id IS NOT NULL
      AND competitor_id IN (
        SELECT id FROM public.competitors WHERE coach_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS gp_teams_coach_insert ON public.game_platform_teams;
DROP POLICY IF EXISTS gp_teams_coach_update ON public.game_platform_teams;

CREATE POLICY gp_teams_coach_insert
  ON public.game_platform_teams
  FOR INSERT
  WITH CHECK (
    public.is_admin_user()
    OR team_id IN (
      SELECT id FROM public.teams WHERE coach_id = auth.uid()
    )
  );

CREATE POLICY gp_teams_coach_update
  ON public.game_platform_teams
  FOR UPDATE
  USING (
    public.is_admin_user()
    OR team_id IN (
      SELECT id FROM public.teams WHERE coach_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin_user()
    OR team_id IN (
      SELECT id FROM public.teams WHERE coach_id = auth.uid()
    )
  );

COMMIT;
