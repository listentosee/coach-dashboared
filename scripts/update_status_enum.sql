-- Update competitor_status enum to include new granular states
-- This script updates the enum and existing records

-- First, create a new enum type with the new values
CREATE TYPE competitor_status_new AS ENUM (
    'pending',
    'profile', 
    'compliance',
    'complete'
);

-- Update existing records to map old values to new ones
UPDATE competitors SET status = 'profile' WHERE status = 'profile updated';

-- Alter the table to use the new enum
ALTER TABLE competitors ALTER COLUMN status TYPE competitor_status_new USING status::text::competitor_status_new;

-- Drop the old enum
DROP TYPE competitor_status;

-- Rename the new enum
ALTER TYPE competitor_status_new RENAME TO competitor_status;

-- Update the default value
ALTER TABLE competitors ALTER COLUMN status SET DEFAULT 'pending';

-- Verify the changes
SELECT 
    first_name,
    last_name,
    status,
    is_18_or_over,
    parent_name,
    parent_email,
    media_release_date,
    participation_agreement_date,
    game_platform_id
FROM competitors
ORDER BY first_name, last_name;
