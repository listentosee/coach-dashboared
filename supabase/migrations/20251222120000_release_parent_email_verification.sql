-- Track parent-email verification for minor Zoho release requests.

ALTER TABLE public.competitors
  ADD COLUMN IF NOT EXISTS parent_email_is_valid boolean,
  ADD COLUMN IF NOT EXISTS parent_email_validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS parent_email_invalid_reason text;

ALTER TABLE public.agreements
  ADD COLUMN IF NOT EXISTS recipient_email_verification_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS recipient_email_verification_status text,
  ADD COLUMN IF NOT EXISTS recipient_email_verification_error text;

CREATE OR REPLACE VIEW public.release_eligible_competitors WITH (security_invoker='on') AS
 SELECT competitors.id,
    competitors.coach_id,
    competitors.email_personal,
    competitors.email_school,
    competitors.first_name,
    competitors.last_name,
    competitors.is_18_or_over,
    competitors.grade,
    competitors.parent_name,
    competitors.parent_email,
    competitors.gender,
    competitors.race,
    competitors.ethnicity,
    competitors.level_of_technology,
    competitors.years_competing,
    competitors.media_release_date,
    competitors.participation_agreement_date,
    competitors.adobe_sign_document_id,
    competitors.profile_update_token,
    competitors.profile_update_token_expires,
    competitors.game_platform_id,
    competitors.game_platform_synced_at,
    competitors.created_at,
    competitors.updated_at,
    competitors.is_active,
    competitors.status,
    competitors.division,
    competitors.game_platform_sync_error,
    competitors.syned_school_id,
    competitors.syned_region_id,
    competitors.syned_coach_user_id,
    competitors.parent_email_is_valid,
    competitors.parent_email_validated_at,
    competitors.parent_email_invalid_reason
   FROM public.competitors
  WHERE (competitors.is_active AND (competitors.status = ANY (ARRAY['profile'::text, 'compliance'::text, 'complete'::text])));

CREATE INDEX IF NOT EXISTS agreements_recipient_email_verification_candidates_idx
  ON public.agreements (created_at)
  WHERE (provider = 'zoho'::text)
    AND (template_kind = 'minor'::text)
    AND (status = 'sent'::text)
    AND (recipient_email_verification_sent_at IS NULL);

INSERT INTO public.job_queue (task_type, payload, status, run_at, is_recurring, recurrence_interval_minutes)
SELECT
  'release_parent_email_verification',
  '{}'::jsonb,
  'pending',
  now(),
  true,
  60
WHERE NOT EXISTS (
  SELECT 1
  FROM public.job_queue
  WHERE task_type = 'release_parent_email_verification'
    AND is_recurring = true
);
