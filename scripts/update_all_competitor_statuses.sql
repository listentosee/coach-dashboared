-- Update all competitor statuses based on their current data
-- This script should be run after implementing the app-based status calculation

-- First, let's see what we have
SELECT 
    first_name,
    last_name,
    is_18_or_over,
    CASE 
        WHEN email_personal IS NOT NULL AND email_personal != '' AND
             email_school IS NOT NULL AND email_school != '' AND
             grade IS NOT NULL AND grade != '' AND
             gender IS NOT NULL AND gender != '' AND
             race IS NOT NULL AND race != '' AND
             ethnicity IS NOT NULL AND ethnicity != '' AND
             level_of_technology IS NOT NULL AND level_of_technology != '' AND
             years_competing IS NOT NULL
        THEN 'profile updated'
        ELSE 'pending'
    END as calculated_status,
    status as current_status
FROM competitors
LIMIT 10;

-- Now update all competitors to 'profile updated' if they have all demographic data
UPDATE competitors 
SET status = 'profile updated'
WHERE 
    email_personal IS NOT NULL AND email_personal != '' AND
    email_school IS NOT NULL AND email_school != '' AND
    grade IS NOT NULL AND grade != '' AND
    gender IS NOT NULL AND gender != '' AND
    race IS NOT NULL AND race != '' AND
    ethnicity IS NOT NULL AND ethnicity != '' AND
    level_of_technology IS NOT NULL AND level_of_technology != '' AND
    years_competing IS NOT NULL;

-- Update to 'complete' if they also have required forms
UPDATE competitors 
SET status = 'complete'
WHERE 
    status = 'profile updated' AND
    (
        (is_18_or_over = true AND participation_agreement_date IS NOT NULL) OR
        (is_18_or_over = false AND media_release_date IS NOT NULL AND participation_agreement_date IS NOT NULL)
    );

-- Show the results
SELECT 
    first_name,
    last_name,
    is_18_or_over,
    status,
    media_release_date,
    participation_agreement_date
FROM competitors
ORDER BY first_name, last_name;
