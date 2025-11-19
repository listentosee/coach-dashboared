-- Ensure PostgREST sees the new alert preference columns added in previous migrations
-- so Supabase clients stop reporting missing column errors.
NOTIFY pgrst, 'reload schema';
