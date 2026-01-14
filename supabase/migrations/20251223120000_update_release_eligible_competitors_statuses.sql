-- Expand release_eligible_competitors to include in_the_game_not_compliant and
-- add the enum value when competitor_status exists.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'competitor_status') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'competitor_status'
        AND e.enumlabel = 'in_the_game_not_compliant'
    ) THEN
      EXECUTE 'ALTER TYPE competitor_status ADD VALUE ''in_the_game_not_compliant''';
    END IF;
  END IF;
END $$;

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
  WHERE (competitors.is_active AND (competitors.status = ANY (ARRAY['profile'::text, 'compliance'::text, 'in_the_game_not_compliant'::text, 'complete'::text])));
