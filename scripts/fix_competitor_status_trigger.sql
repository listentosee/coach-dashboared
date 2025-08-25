-- Fix missing competitor status trigger and function type casting issue
-- This script fixes the type casting error and adds the missing trigger

-- First, fix the update_competitor_status function to use correct type
CREATE OR REPLACE FUNCTION update_competitor_status()
RETURNS TRIGGER AS $$
BEGIN
    NEW.status = calculate_competitor_status(NEW.id)::competitor_status;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_update_competitor_status ON competitors;

-- Create the trigger to automatically update status on INSERT and UPDATE
CREATE TRIGGER trigger_update_competitor_status
    BEFORE INSERT OR UPDATE ON competitors
    FOR EACH ROW
    EXECUTE FUNCTION update_competitor_status();

-- Update all existing competitors to recalculate their status
UPDATE competitors SET status = calculate_competitor_status(id)::competitor_status;

-- Verify the trigger was created
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers 
WHERE trigger_name = 'trigger_update_competitor_status';
