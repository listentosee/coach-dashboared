# Migration: Remove raw_data JSONB Field

**Date:** 2025-10-06
**Status:** ✅ Ready to Execute
**Priority:** Medium (cleanup/optimization)

---

## Summary

The `game_platform_stats.raw_data` field is no longer needed. All data has been migrated to normalized tables:
- ✅ Challenge solves → `game_platform_challenge_solves`
- ✅ Flash CTF events → `game_platform_flash_ctf_events`
- ✅ Aggregates → `game_platform_stats` top-level fields

---

## Current State

### Tables Using raw_data

**game_platform_stats:**
```sql
raw_data JSONB -- Contains legacy structure:
{
  "scores": {
    "challenge_solves": [...],  -- DEPRECATED ❌
    "category_points": {...}    -- DEPRECATED ❌
  },
  "flash_ctfs": [...]           -- Still used for dashboard ⚠️
}
```

### Code Analysis

#### ✅ Already Migrated
- [app/api/game-platform/dashboard/route.ts](../../app/api/game-platform/dashboard/route.ts) - Now reads from `game_platform_challenge_solves`
- [app/api/game-platform/report-card/[competitorId]/route.ts](../../app/api/game-platform/report-card/[competitorId]/route.ts) - Already using normalized tables
- Sync jobs - Never wrote to `raw_data.scores.challenge_solves`

#### ⚠️ Still Uses raw_data
**Flash CTF data:**
- [app/api/game-platform/dashboard/route.ts:286](../../app/api/game-platform/dashboard/route.ts#L286)
  ```typescript
  const flashEntries = raw?.flash_ctfs ?? [];
  ```

**Solution:** Flash CTF is already in `game_platform_flash_ctf_events` table (queried at line 373-378), but not fully utilized in dashboard.

---

## Migration Plan

### Phase 1: Migrate Flash CTF Usage ⏭️

**File:** [app/api/game-platform/dashboard/route.ts](../../app/api/game-platform/dashboard/route.ts)

**Current (line 286):**
```typescript
const raw = stat.raw_data || {};
const flashEntries = raw?.flash_ctfs ?? [];
const flashChallenges = flashEntries.reduce((sum: number, entry: any) =>
  sum + (entry?.challenges_solved ?? 0), 0);
```

**New:**
```typescript
// Flash CTF events already queried at line 373-378
// Add to competitorMap during first loop
```

**Steps:**
1. Query `game_platform_flash_ctf_events` in the first loop (alongside challenge_solves)
2. Group by `syned_user_id` similar to challenge solves
3. Store Flash CTF count in competitorMap
4. Remove `raw?.flash_ctfs` reference

### Phase 2: Remove raw_data Column 🗑️

**After Phase 1 is deployed and verified:**

```sql
-- Migration: 20251007_remove_raw_data_column.sql

BEGIN;

-- Backup data first (optional, for safety)
CREATE TABLE game_platform_stats_raw_data_backup AS
SELECT competitor_id, raw_data
FROM game_platform_stats
WHERE raw_data IS NOT NULL;

-- Remove the column
ALTER TABLE game_platform_stats
DROP COLUMN raw_data;

COMMIT;
```

**Rollback Plan:**
```sql
-- If needed, restore column
ALTER TABLE game_platform_stats
ADD COLUMN raw_data JSONB;

-- Restore from backup
UPDATE game_platform_stats gps
SET raw_data = b.raw_data
FROM game_platform_stats_raw_data_backup b
WHERE gps.competitor_id = b.competitor_id;
```

---

## Benefits

### Performance
- **Smaller table size** - JSONB fields are large, removing saves disk space
- **Faster queries** - No JSONB parsing overhead
- **Better indexes** - Normalized tables have proper indexes

### Maintainability
- **Single source of truth** - No data duplication
- **Easier debugging** - SQL queries instead of JSON path navigation
- **Type safety** - Proper columns instead of dynamic JSON

### Cost Savings
- **Storage costs** - ~40% reduction in `game_platform_stats` table size (estimated)
- **Bandwidth** - Smaller API responses

---

## Risks & Mitigation

### Risk 1: Unknown Dependencies
**Mitigation:**
- Grep entire codebase for `raw_data` before migration
- Add monitoring for 500 errors after deployment

### Risk 2: Backup/Export Tools
**Mitigation:**
- Check if any export scripts use `raw_data`
- Update admin tools that might display raw JSON

### Risk 3: Analytics Queries
**Mitigation:**
- Verify no Supabase SQL queries depend on `raw_data`
- Check if any dashboards/reports reference it

---

## Verification Steps

### Pre-Migration
```bash
# 1. Search for any raw_data usage
grep -r "raw_data" app/ lib/ --include="*.ts" --include="*.tsx"

# 2. Check database size before
psql -c "SELECT pg_size_pretty(pg_total_relation_size('game_platform_stats'));"

# 3. Count records with raw_data
psql -c "SELECT COUNT(*) FROM game_platform_stats WHERE raw_data IS NOT NULL;"
```

### Post-Migration
```bash
# 1. Verify column removed
psql -c "\d game_platform_stats"

# 2. Check new table size
psql -c "SELECT pg_size_pretty(pg_total_relation_size('game_platform_stats'));"

# 3. Test dashboard loads
curl https://your-domain.com/api/game-platform/dashboard

# 4. Test report cards
curl https://your-domain.com/api/game-platform/report-card/[competitor-id]
```

---

## Timeline

### Week 1 (Current)
- ✅ Audit code for `raw_data` usage
- ✅ Fix dashboard to use normalized tables
- ✅ Fix report card query
- ⏭️ Migrate Flash CTF usage (Phase 1)

### Week 2
- Deploy Phase 1 to production
- Monitor for 3-7 days
- Verify no errors

### Week 3
- Execute Phase 2 (remove column)
- Monitor performance improvements
- Document savings

---

## Open Questions

1. **Are there any external integrations** that might read `raw_data`?
   - Answer: TBD - need to check

2. **Do we have any analytics queries** using `raw_data`?
   - Answer: TBD - check Supabase SQL editor history

3. **Should we keep backup table permanently** or drop after 30 days?
   - Recommendation: Keep for 30 days, then drop

---

## Related Documents
- [BUGFIX-drill-down-zeros-2025-10-06.md](./BUGFIX-drill-down-zeros-2025-10-06.md) - Original bug that triggered this cleanup
- [game-platform-integration.md](./game-platform-integration.md) - Architecture spec (Section 6)
- [phase-c-completion-summary.md](./phase-c-completion-summary.md) - Migration history

---

**Status:** Phase 1 in progress
**Owner:** Development team
**Est. Completion:** Week of 2025-10-13
