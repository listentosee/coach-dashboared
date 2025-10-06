-- ============================================================================
-- Drop raw_data Column from game_platform_stats
-- ============================================================================
-- Date: 2025-10-06
-- Purpose: Remove deprecated raw_data JSONB column now that all code uses
--          normalized tables (game_platform_challenge_solves,
--          game_platform_flash_ctf_events)
--
-- SAFETY: This migration creates a backup table before dropping the column
--
-- Related:
-- - FIXES-SUMMARY-2025-10-06.md
-- - docs/game-platform/MIGRATION-remove-raw-data-field.md
-- ============================================================================

BEGIN;

-- Step 1: Create backup table with raw_data (for safety/rollback)
-- Note: This is optional but recommended for production
CREATE TABLE IF NOT EXISTS game_platform_stats_raw_data_backup (
  competitor_id UUID PRIMARY KEY,
  raw_data JSONB,
  backed_up_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 2: Backup existing raw_data
INSERT INTO game_platform_stats_raw_data_backup (competitor_id, raw_data)
SELECT competitor_id, raw_data
FROM game_platform_stats
WHERE raw_data IS NOT NULL
ON CONFLICT (competitor_id) DO UPDATE
SET raw_data = EXCLUDED.raw_data,
    backed_up_at = NOW();

-- Step 3: Drop the raw_data column
ALTER TABLE game_platform_stats
DROP COLUMN IF EXISTS raw_data;

-- Step 4: Add comment to backup table explaining retention policy
COMMENT ON TABLE game_platform_stats_raw_data_backup IS
  'Backup of raw_data column dropped on 2025-10-06. Can be deleted after 30 days if no issues arise. See docs/game-platform/MIGRATION-remove-raw-data-field.md';

COMMIT;

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Verify column is dropped
-- Expected: raw_data should NOT appear in column list
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'game_platform_stats'
-- ORDER BY ordinal_position;

-- Check backup table
-- Expected: Should have records equal to competitors with game_platform_id
-- SELECT COUNT(*) FROM game_platform_stats_raw_data_backup;

-- ============================================================================
-- Rollback Plan (if needed within 30 days)
-- ============================================================================

-- ONLY run this if you need to restore the column
--
-- BEGIN;
--
-- -- Add column back
-- ALTER TABLE game_platform_stats
-- ADD COLUMN raw_data JSONB;
--
-- -- Restore from backup
-- UPDATE game_platform_stats gps
-- SET raw_data = b.raw_data
-- FROM game_platform_stats_raw_data_backup b
-- WHERE gps.competitor_id = b.competitor_id;
--
-- COMMIT;

-- ============================================================================
-- Cleanup (after 30 days in production with no issues)
-- ============================================================================

-- After verifying everything works for 30 days, drop the backup table:
-- DROP TABLE IF EXISTS game_platform_stats_raw_data_backup;
