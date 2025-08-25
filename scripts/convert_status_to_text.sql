-- Convert competitor_status from enum to TEXT for flexibility
-- This allows changing status values without database migrations

-- Step 1: Add a new TEXT column
ALTER TABLE competitors ADD COLUMN status_new TEXT;

-- Step 2: Copy existing enum values to the new TEXT column
UPDATE competitors SET status_new = status::text;

-- Step 3: Drop the old enum column
ALTER TABLE competitors DROP COLUMN status;

-- Step 4: Rename the new column
ALTER TABLE competitors RENAME COLUMN status_new TO status;

-- Step 5: Set default value
ALTER TABLE competitors ALTER COLUMN status SET DEFAULT 'pending';

-- Step 6: Add a check constraint for validation (optional)
ALTER TABLE competitors ADD CONSTRAINT competitors_status_check 
CHECK (status IN ('pending', 'profile', 'compliance', 'complete'));

-- Step 7: Update existing records to use new status values
UPDATE competitors SET status = 'profile' WHERE status = 'profile updated';

-- Step 8: Drop the old enum type (no longer needed)
DROP TYPE IF EXISTS competitor_status;

-- Step 9: Verify the changes
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
