-- Simple, reliable competitor status update
-- This approach avoids complex enum migrations and uses a simple text field

-- 1. Add is_active column for greyed out display
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 2. Convert status column to text (simple and flexible)
ALTER TABLE competitors ALTER COLUMN status TYPE TEXT;

-- 3. Update existing statuses to new values
UPDATE competitors 
SET status = CASE 
    WHEN status = 'active' THEN 'pending'
    WHEN status = 'inactive' THEN 'pending'
    ELSE 'pending'
END;

-- 4. Create simple status calculation function
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

-- 5. Create simple trigger
CREATE OR REPLACE FUNCTION update_competitor_status()
RETURNS TRIGGER AS $$
BEGIN
    NEW.status = calculate_competitor_status(NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Create trigger
DROP TRIGGER IF EXISTS trigger_update_competitor_status ON competitors;
CREATE TRIGGER trigger_update_competitor_status
    BEFORE INSERT OR UPDATE ON competitors
    FOR EACH ROW
    EXECUTE FUNCTION update_competitor_status();

-- 7. Update all existing competitors to recalculate their status
UPDATE competitors SET status = calculate_competitor_status(id);
