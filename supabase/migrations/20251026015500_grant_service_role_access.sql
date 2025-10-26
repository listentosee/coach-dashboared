-- Ensure the service_role can read key tables required for admin operations.
GRANT SELECT ON public.profiles TO service_role;
GRANT SELECT ON public.competitors TO service_role;

-- Authenticated users (coaches/admins) require read/write access; RLS still governs row-level behavior.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitors TO authenticated;

-- Future tables created in the public schema should inherit privileges for both roles.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
