-- Add flag to track which competitors need totals refreshed
-- Part of ODL incremental sync implementation (Phase 2: Totals Refresh Sweep)
-- See docs/game-platform/game-platform-integration.md Section 19.2

ALTER TABLE public.game_platform_sync_state
ADD COLUMN IF NOT EXISTS needs_totals_refresh boolean DEFAULT false;

-- Index for efficient sweep queries (partial index on true values only)
CREATE INDEX IF NOT EXISTS idx_game_platform_sync_state_needs_refresh
ON public.game_platform_sync_state (needs_totals_refresh)
WHERE needs_totals_refresh = true;

COMMENT ON COLUMN public.game_platform_sync_state.needs_totals_refresh IS
'Flag indicating competitor has new challenge solves and needs aggregate totals refreshed. Set by incremental sync job, cleared by totals refresh sweep job.';
