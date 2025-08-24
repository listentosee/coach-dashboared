-- Fix competitor status calculation and view
-- This script will:
-- 1. Create the missing calculate_competitor_status function
-- 2. Update the comp_team_view to include missing fields
-- 3. Recalculate status for all existing competitors

-- Step 1: Create the missing calculate_competitor_status function
CREATE OR REPLACE FUNCTION calculate_competitor_status(competitor_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    competitor_record RECORD;
    has_profile_data BOOLEAN;
    has_required_forms BOOLEAN;
BEGIN
    -- Get competitor data
    SELECT 
        is_18_or_over,
        email_personal,
        email_school,
        grade,
        gender,
        race,
        ethnicity,
        level_of_technology,
        years_competing,
        media_release_date,
        participation_agreement_date
    INTO competitor_record
    FROM competitors 
    WHERE id = competitor_id;
    
    IF NOT FOUND THEN
        RETURN 'pending';
    END IF;
    
    -- Check if all demographic fields are filled (Profile Complete)
    has_profile_data := (
        competitor_record.email_personal IS NOT NULL AND competitor_record.email_personal != '' AND
        competitor_record.email_school IS NOT NULL AND competitor_record.email_school != '' AND
        competitor_record.grade IS NOT NULL AND competitor_record.grade != '' AND
        competitor_record.gender IS NOT NULL AND competitor_record.gender != '' AND
        competitor_record.race IS NOT NULL AND competitor_record.race != '' AND
        competitor_record.ethnicity IS NOT NULL AND competitor_record.ethnicity != '' AND
        competitor_record.level_of_technology IS NOT NULL AND competitor_record.level_of_technology != '' AND
        competitor_record.years_competing IS NOT NULL
    );
    
    -- Check required forms based on age
    IF competitor_record.is_18_or_over THEN
        -- For 18+ competitors: only need participation agreement
        has_required_forms := competitor_record.participation_agreement_date IS NOT NULL;
    ELSE
        -- For under 18: need both media release and participation agreement
        has_required_forms := (
            competitor_record.media_release_date IS NOT NULL AND 
            competitor_record.participation_agreement_date IS NOT NULL
        );
    END IF;
    
    -- Determine status
    IF has_profile_data AND has_required_forms THEN
        RETURN 'complete';
    ELSIF has_profile_data THEN
        RETURN 'profile updated';
    ELSE
        RETURN 'pending';
    END IF;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION calculate_competitor_status(UUID) TO authenticated;

-- Step 2: Update the comp_team_view to include missing fields
DROP VIEW IF EXISTS comp_team_view;

CREATE VIEW comp_team_view AS
SELECT 
    c.id,
    c.first_name,
    c.last_name,
    c.email_personal,
    c.email_school,
    c.is_18_or_over,
    c.grade,
    c.status,
    c.media_release_signed,
    c.media_release_date,
    c.participation_agreement_signed,
    c.participation_agreement_date,
    c.game_platform_id,
    c.game_platform_synced_at,
    c.profile_update_token,
    c.profile_update_token_expires,
    c.created_at,
    c.is_active,
    t.id AS team_id,
    t.name AS team_name,
    tm.position AS team_position
FROM competitors c
LEFT JOIN team_members tm ON c.id = tm.competitor_id
LEFT JOIN teams t ON tm.team_id = t.id
WHERE c.coach_id = auth.uid();

-- Step 3: Recalculate status for all existing competitors
UPDATE competitors SET status = calculate_competitor_status(id)::competitor_status;
