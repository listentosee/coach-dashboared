CREATE OR REPLACE VIEW public.coach_competitor_counts AS
SELECT c.coach_id,
       COUNT(*)::bigint AS competitor_count
FROM public.competitors AS c
GROUP BY c.coach_id;

-- Helpful index if querying competitors by coach_id elsewhere
CREATE INDEX IF NOT EXISTS idx_competitors_coach_id ON public.competitors(coach_id);