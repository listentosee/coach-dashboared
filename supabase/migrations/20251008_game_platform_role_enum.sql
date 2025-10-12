-- Introduce dedicated MetaCTF role enum so competitors can be marked distinctly from coaches.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'metactf_role'
  ) THEN
    CREATE TYPE public.metactf_role AS ENUM ('coach', 'user');
  END IF;
END;
$$;

-- Update the game_platform_profiles table to use the new enum.
ALTER TABLE public.game_platform_profiles
  ALTER COLUMN metactf_role TYPE public.metactf_role
  USING (metactf_role::text::public.metactf_role);
