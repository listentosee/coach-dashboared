-- Update competitor status enum and add status calculation logic

-- 1. Create new enum type
CREATE TYPE competitor_status_new AS ENUM ('pending', 'profile_complete', 'complete');

-- 2. Add is_active column to competitors table
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 3. Create function to calculate competitor status (using text for now)
CREATE OR REPLACE FUNCTION calculate_competitor_status(competitor_id UUID)
RETURNS TEXT AS $$
DECLARE
    competitor_record RECORD;
BEGIN
    -- Get competitor data
    SELECT 
        first_name, last_name, grade, gender, race, ethnicity, 
        years_competing, level_of_technology, parent_name, parent_email,
        media_release_signed, participation_agreement_signed
    INTO competitor_record
    FROM competitors 
    WHERE id = competitor_id;
    
    -- Check if profile is complete (all demographic fields filled)
    IF competitor_record.first_name IS NOT NULL 
        AND competitor_record.last_name IS NOT NULL
        AND competitor_record.grade IS NOT NULL
        AND competitor_record.gender IS NOT NULL
        AND competitor_record.race IS NOT NULL
        AND competitor_record.ethnicity IS NOT NULL
        AND competitor_record.years_competing IS NOT NULL
        AND competitor_record.level_of_technology IS NOT NULL
        AND competitor_record.parent_name IS NOT NULL
        AND competitor_record.parent_email IS NOT NULL THEN
        
        -- Check if agreements are signed (have date values)
        IF competitor_record.media_release_signed IS NOT NULL
            AND competitor_record.participation_agreement_signed IS NOT NULL THEN
            RETURN 'complete';
        ELSE
            RETURN 'profile_complete';
        END IF;
    ELSE
        RETURN 'pending';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 4. Create trigger to automatically update status
CREATE OR REPLACE FUNCTION update_competitor_status()
RETURNS TRIGGER AS $$
BEGIN
    NEW.status = calculate_competitor_status(NEW.id)::competitor_status_new;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create trigger
DROP TRIGGER IF EXISTS trigger_update_competitor_status ON competitors;
CREATE TRIGGER trigger_update_competitor_status
    BEFORE INSERT OR UPDATE ON competitors
    FOR EACH ROW
    EXECUTE FUNCTION update_competitor_status();

-- 6. First drop the default constraint from the status column
ALTER TABLE competitors 
    ALTER COLUMN status DROP DEFAULT;

-- 7. Now alter the column type with your USING clause
ALTER TABLE competitors 
    ALTER COLUMN status TYPE competitor_status_new 
    USING CASE 
        WHEN status::text = 'active' THEN 'pending'::competitor_status_new
        WHEN status::text = 'inactive' THEN 'pending'::competitor_status_new
        ELSE 'pending'::competitor_status_new
    END;

-- 8. Add back a default value with the new type
ALTER TABLE competitors 
    ALTER COLUMN status SET DEFAULT 'pending'::competitor_status_new;

-- 9. Drop old enum
DROP TYPE competitor_status;

-- 10. Rename new enum
ALTER TYPE competitor_status_new RENAME TO competitor_status;

-- 11. Update all existing competitors to recalculate their status
UPDATE competitors SET status = calculate_competitor_status(id)::competitor_status;
