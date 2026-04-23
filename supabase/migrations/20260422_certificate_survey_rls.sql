-- Explicit RLS policies for competitor_certificates and survey_results.
--
-- Rationale: the original migration enabled RLS on both tables but did not
-- define any policies, which means non-service-role reads silently return
-- zero rows. All current code paths use the service role (which bypasses
-- RLS), so functionality is unaffected today — but any future user-context
-- query would break mysteriously. These policies codify the intended access
-- model so future code can rely on them.
--
-- Access model:
--   - Admins: SELECT everything.
--   - Coaches: SELECT only their own rows (own competitors' certificates and
--     surveys, or their own coach feedback surveys).
--   - All other authenticated users: no access.
--   - Service role: implicitly bypasses RLS (writes + unrestricted reads).
--   No INSERT/UPDATE/DELETE policies — those operations go through API routes
--   using the service-role client only.

-- ---------- competitor_certificates ----------

DROP POLICY IF EXISTS admins_select_competitor_certificates ON public.competitor_certificates;
CREATE POLICY admins_select_competitor_certificates ON public.competitor_certificates
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS coaches_select_own_competitor_certificates ON public.competitor_certificates;
CREATE POLICY coaches_select_own_competitor_certificates ON public.competitor_certificates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.competitors c
      WHERE c.id = competitor_certificates.competitor_id
        AND c.coach_id = auth.uid()
    )
  );

-- ---------- survey_results ----------

DROP POLICY IF EXISTS admins_select_survey_results ON public.survey_results;
CREATE POLICY admins_select_survey_results ON public.survey_results
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS coaches_select_own_competitor_survey_results ON public.survey_results;
CREATE POLICY coaches_select_own_competitor_survey_results ON public.survey_results
  FOR SELECT
  USING (
    type = 'competitor'
    AND competitor_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.competitors c
      WHERE c.id = survey_results.competitor_id
        AND c.coach_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS coaches_select_own_coach_survey_results ON public.survey_results;
CREATE POLICY coaches_select_own_coach_survey_results ON public.survey_results
  FOR SELECT
  USING (
    type = 'coach'
    AND coach_profile_id = auth.uid()
  );

COMMENT ON POLICY admins_select_competitor_certificates ON public.competitor_certificates IS
  'Admins can read all certificate records.';
COMMENT ON POLICY coaches_select_own_competitor_certificates ON public.competitor_certificates IS
  'Coaches can read certificate rows for competitors they own.';
COMMENT ON POLICY admins_select_survey_results ON public.survey_results IS
  'Admins can read all survey submissions.';
COMMENT ON POLICY coaches_select_own_competitor_survey_results ON public.survey_results IS
  'Coaches can read competitor survey submissions tied to their own competitors.';
COMMENT ON POLICY coaches_select_own_coach_survey_results ON public.survey_results IS
  'Coaches can read their own coach feedback submissions.';
