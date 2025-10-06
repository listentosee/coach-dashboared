# Sync Verification Checklist

Use this checklist to verify the enhanced mock data sync is working correctly.

## ✅ Step 1: Mock Server Status

```bash
curl http://localhost:4010/integrations/syned/v1/ | jq
```

**Expected:**
```json
{
  "status": "ok",
  "storageMode": "postgres",
  "dataset": "supabase-sync"
}
```

## ✅ Step 2: Verify Enhanced ODL Data

```bash
curl "http://localhost:4010/integrations/syned/v1/scores/get_odl_scores?syned_user_id=42d2f47f-c965-4ddb-8071-f601a1d0194d" | jq '{total_challenges, total_points, challenge_count: (.challenge_solves | length)}'
```

**Expected:**
- `total_challenges`: 8 (or 8-15 range for different users)
- `challenge_count`: 8 (challenge_solves array present)
- `total_points`: 3000+ (varied)

## ✅ Step 3: Check Challenge Names

```bash
curl -s "http://localhost:4010/integrations/syned/v1/scores/get_odl_scores?syned_user_id=42d2f47f-c965-4ddb-8071-f601a1d0194d" | jq '.challenge_solves[] | {title, category, points}' | head -20
```

**Expected:** Realistic names like:
- "Path Hijacking", "DNS Tunneling", "AES Decryption"
- NOT "Quest 1", "Quest 2" (old generic names)

## ✅ Step 4: Run Sync Job

```bash
curl -X POST http://localhost:3000/api/jobs/run \
  -H "Content-Type: application/json" \
  -H "x-job-runner-secret: 3d51f7c69e4c41c08bb5ebd19d4d2f60" \
  -d '{"limit":5}'
```

**Expected:**
```json
{
  "status": "ok",
  "processed": 1,
  "succeeded": 1,
  "failed": 0
}
```

## ✅ Step 5: Database Verification

Run these queries in Supabase SQL Editor (or use the file `scripts/check-sync-results.sql`):

### Query 1: Total Challenge Count by Source

```sql
SELECT
  source,
  COUNT(*) as challenge_count,
  SUM(challenge_points) as total_points
FROM game_platform_challenge_solves
GROUP BY source;
```

**Expected Results:**
| source | challenge_count | total_points |
|--------|-----------------|--------------|
| odl | 8+ per synced competitor | 2000-5000+ per |
| flash_ctf | 2-10+ per event | 200-1000+ per event |

**Example for 3 synced competitors:**
- `odl`: ~24-45 records (8-15 each)
- `flash_ctf`: ~6-30 records (2-10 per event, 1-3 events each)

### Query 2: ODL Category Distribution

```sql
SELECT
  challenge_category,
  COUNT(*) as count,
  MIN(challenge_points) as min_points,
  MAX(challenge_points) as max_points
FROM game_platform_challenge_solves
WHERE source = 'odl'
GROUP BY challenge_category
ORDER BY count DESC;
```

**Expected:** Multiple categories showing:
- operating_systems
- forensics
- web
- networking
- cryptography
- osint
- reverse_engineering
- binary_exploitation
- miscellaneous

**Note:** Not all categories will appear for every sync (depends on how many competitors synced).

### Query 3: Sample Challenge Records

```sql
SELECT
  challenge_title,
  challenge_category,
  challenge_points,
  source
FROM game_platform_challenge_solves
WHERE source = 'odl'
ORDER BY solved_at DESC
LIMIT 20;
```

**Expected:** Realistic challenge names like:
- "SQL Injection Deep Dive"
- "Buffer Overflow"
- "Memory Dump Analysis"
- "Path Hijacking"
- "RSA Cracking"

**NOT Expected:**
- "Quest 1", "Quest 2" (old generic names)

### Query 4: Flash CTF Events

```sql
SELECT
  flash_ctf_name,
  challenges_solved,
  points_earned,
  rank
FROM game_platform_flash_ctf_events
ORDER BY started_at DESC
LIMIT 10;
```

**Expected:** Event names like:
- "Spring Sprint CTF"
- "Summer Challenge"
- "Fall Fast CTF"
- "Winter Warfare"

**NOT Expected:**
- "Regional Flash" (old generic name - though might still appear in some records)

### Query 5: Per-Competitor Summary

```sql
SELECT
  c.first_name,
  c.last_name,
  COUNT(CASE WHEN gcs.source = 'odl' THEN 1 END) as odl_challenges,
  COUNT(CASE WHEN gcs.source = 'flash_ctf' THEN 1 END) as flash_challenges,
  COUNT(DISTINCT gfe.id) as flash_events
FROM competitors c
LEFT JOIN game_platform_challenge_solves gcs ON gcs.syned_user_id = c.game_platform_id
LEFT JOIN game_platform_flash_ctf_events gfe ON gfe.syned_user_id = c.game_platform_id
WHERE c.game_platform_id IS NOT NULL
GROUP BY c.id, c.first_name, c.last_name
ORDER BY odl_challenges DESC;
```

**Expected (per synced competitor):**
- `odl_challenges`: 8-15
- `flash_challenges`: 2-30 (depending on number of events)
- `flash_events`: 1-3

## ✅ Step 6: Verify Challenge Diversity

Check that categories are well-distributed:

```sql
SELECT
  challenge_category,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) as percentage
FROM game_platform_challenge_solves
WHERE source = 'odl'
GROUP BY challenge_category
ORDER BY count DESC;
```

**Expected:** No single category dominates. Distribution should roughly be:
- operating_systems: ~15-20%
- forensics: ~10-15%
- web: ~10-15%
- (other categories): ~5-12% each

## ✅ Step 7: Check Point Distribution

```sql
SELECT
  CASE
    WHEN challenge_points < 200 THEN 'Easy (100-199)'
    WHEN challenge_points < 400 THEN 'Medium (200-399)'
    ELSE 'Hard (400-600)'
  END as difficulty,
  COUNT(*) as count,
  MIN(challenge_points) as min_pts,
  MAX(challenge_points) as max_pts
FROM game_platform_challenge_solves
WHERE source = 'odl'
GROUP BY
  CASE
    WHEN challenge_points < 200 THEN 'Easy (100-199)'
    WHEN challenge_points < 400 THEN 'Medium (200-399)'
    ELSE 'Hard (400-600)'
  END
ORDER BY min_pts;
```

**Expected:** Mix of difficulties:
- Easy: ~40%
- Medium: ~40%
- Hard: ~20%

## Troubleshooting

### Issue: No ODL challenge records created

**Check:**
1. Schema includes `challenge_solves`?
   ```bash
   grep -A 5 "ScoresResponseSchema" lib/integrations/game-platform/client.ts
   # Should show: challenge_solves: z.array(ChallengeSolveSchema).optional()
   ```

2. Mock returning challenge_solves?
   ```bash
   curl -s "http://localhost:4010/integrations/syned/v1/scores/get_odl_scores?syned_user_id=42d2f47f-c965-4ddb-8071-f601a1d0194d" | jq '.challenge_solves | length'
   # Should show: 8 (or other non-zero number)
   ```

3. App restarted after schema change?
   - Stop and restart `npm run dev`

### Issue: Still seeing old "Quest" challenge names

**Cause:** Mock server not restarted with new fixtures

**Fix:**
```bash
# Stop mock server (Ctrl+C)
# Restart with new data
npm run testenv
```

### Issue: Category distribution seems off

**Note:** This is normal for small syncs. If you only synced 1-3 competitors, you'll see limited category variety. Each competitor has 8-15 challenges spread across multiple categories, but not all categories will appear in every competitor's data.

**To get full distribution:** Sync more competitors:
```bash
curl -X POST http://localhost:3000/api/jobs/run \
  -H "Content-Type: application/json" \
  -H "x-job-runner-secret: 3d51f7c69e4c41c08bb5ebd19d4d2f60" \
  -d '{"limit":10}'
```

## Success Criteria

✅ **PASS** if:
- ODL challenge records created (8-15 per competitor)
- Multiple categories present (5+ different categories)
- Realistic challenge names (not "Quest X")
- Flash CTF events created (1-3 per competitor)
- Flash CTF challenge records created (2-10 per event)
- Point values varied (100-600 range)

❌ **FAIL** if:
- Zero ODL challenge records
- Only "Quest 1", "Quest 2" names
- All challenges in same category
- All challenges same point value

## Expected Totals

For a sync of **5 competitors**, expect approximately:
- **40-75 ODL challenge records** (8-15 each)
- **5-15 Flash CTF events** (1-3 each)
- **10-150 Flash CTF challenge records** (2-10 per event)
- **~50-200+ total challenge records**

For a sync of **18 competitors** (full supabase-sync dataset):
- **~144-270 ODL challenge records**
- **~18-54 Flash CTF events**
- **~36-540 Flash CTF challenge records**
- **~180-800+ total challenge records**