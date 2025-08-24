-- Create the missing calculate_competitor_status function
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

-- Update existing competitors to recalculate their status
UPDATE competitors SET status = calculate_competitor_status(id)::competitor_status;
