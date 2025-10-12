# MetaCTF Production Deployment Plan

## Current Status: Phase C Complete ✅

**What's Been Built:**
- ✅ Client/service layer with proper schema handling
- ✅ Competitor onboarding flow
- ✅ Team lifecycle integration
- ✅ Background sync jobs (roster + stats)
- ✅ Dashboard UI integration
- ✅ Detailed score ingestion (ODL + Flash CTF)
- ✅ Drill-down components
- ✅ Staging dataset seeded with 403 realistic challenge records
- ✅ Test data across 9 cybersecurity domains

**What's Remaining from Phase C:**
- ⏭️ UI retry/clear options for failed onboarding (deferred to Phase D)
- ⏭️ Dashboard aggregates/alerts (data foundation ready)
- ⏭️ E2E automated tests (manual testing complete)

---

## Production Deployment Checklist

### 1. Environment Configuration ⚙️

#### Required Environment Variables
```bash
# Production MetaCTF API
GAME_PLATFORM_API_BASE_URL=https://api.metactf.com/integrations/syned/v1
GAME_PLATFORM_API_TOKEN=<production_token_from_metactf>
GAME_PLATFORM_INTEGRATION_ENABLED=true

# Background Jobs
INTERNAL_SYNC_SECRET=<generate_secure_token>

# Supabase (already configured)
NEXT_PUBLIC_SUPABASE_URL=<prod_url>
SUPABASE_SERVICE_ROLE_KEY=<prod_key>
```

#### Verify Configuration
- [ ] Obtain production MetaCTF API token from vendor
- [ ] Test token against production endpoint (read-only operation)
- [ ] Set up secrets in deployment platform (Vercel/Railway/etc)
- [ ] Configure CORS/allowed origins if needed
- [ ] Set up rate limiting if required by vendor

---

### 2. Database Readiness 🗄️

#### Schema Verification
```sql
-- Verify all tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE 'game_platform%';

-- Expected tables:
-- game_platform_stats
-- game_platform_challenge_solves
-- game_platform_flash_ctf_events
-- game_platform_sync_state
```

#### Migration Checklist
- [ ] Run migration: `supabase/migrations/20250926_game_platform_detail_tables.sql`
- [ ] Verify indexes on:
  - `game_platform_challenge_solves(syned_user_id, challenge_solve_id)` (unique constraint)
  - `game_platform_flash_ctf_events(syned_user_id, event_id)` (unique constraint)
  - `game_platform_sync_state(syned_user_id)` (primary key)
- [ ] Test foreign key constraints work correctly
- [ ] Verify RLS policies if applicable

#### Data Cleanup
- [ ] Remove any test data from development
- [ ] Clear test IDs from `competitors.game_platform_id` if any exist
- [ ] Reset sync state table: `DELETE FROM game_platform_sync_state WHERE 1=1;`

---

### 3. Pre-Production Testing 🧪

#### Staging Environment Test (If Available)
- [ ] Deploy to staging environment before production cutover
- [ ] Verify all flows work end-to-end
- [ ] Run full sync job for test competitors
- [ ] Check database records created correctly
- [ ] Verify dashboard displays data

#### Production API Smoke Test
```bash
# Test authentication
curl -H "Authorization: Bearer $PROD_TOKEN" \
  https://api.metactf.com/integrations/syned/v1/

# Test read operation (if you have test users)
curl -H "Authorization: Bearer $PROD_TOKEN" \
  "https://api.metactf.com/integrations/syned/v1/users?syned_user_id=<test_id>"
```

- [ ] Verify authentication works
- [ ] Test GET operations (read-only)
- [ ] Confirm response schemas match expectations
- [ ] Check rate limits and response times

---

### 4. Initial Production Deployment 🚀

#### Phase 1: Soft Launch (READ-ONLY)
**Goal:** Verify connectivity without making changes

```bash
# Temporarily disable write operations
GAME_PLATFORM_INTEGRATION_ENABLED=false  # Set this first
```

- [ ] Deploy application to production
- [ ] Verify health checks pass
- [ ] Monitor logs for any errors
- [ ] Test dashboard UI loads correctly

#### Phase 2: Coach Pilot (1-2 COACHES)
**Goal:** Test with real data but limited scope

```bash
# Enable integration for specific coaches
GAME_PLATFORM_INTEGRATION_ENABLED=true
```

- [ ] Select 1-2 pilot coaches with 5-10 competitors each
- [ ] Manually onboard their competitors via API
- [ ] Run sync job for pilot coaches only:
  ```bash
  curl -X POST https://your-domain.com/api/internal/sync \
    -H "x-internal-sync-secret: $SECRET" \
    -d '{"coachId": "<pilot_coach_id>"}'
  ```
- [ ] Verify MetaCTF reflects the data correctly
- [ ] Check Supabase has challenge records
- [ ] Have pilot coaches review dashboard
- [ ] Monitor for 48 hours

**Success Criteria:**
- ✅ All pilot competitors onboarded successfully
- ✅ No sync errors in logs
- ✅ Dashboard shows accurate data
- ✅ Coaches can see their teams/rosters
- ✅ Challenge data populating correctly

#### Phase 3: Gradual Rollout
**Goal:** Expand to all coaches

- [ ] Monitor pilot for 1 week minimum
- [ ] Document any issues found
- [ ] Fix any edge cases discovered
- [ ] Enable for 10% of coaches
- [ ] Monitor for 48 hours
- [ ] Enable for 50% of coaches
- [ ] Monitor for 24 hours
- [ ] Enable for 100% of coaches

---

### 5. Background Jobs Setup ⏰

#### Sync Job Configuration
```bash
# Cron job or scheduler config
# Run every 6 hours (adjust as needed)
0 */6 * * * curl -X POST https://your-domain.com/api/internal/sync \
  -H "x-internal-sync-secret: $SECRET" \
  -d '{}'
```

**Scheduler Options:**
- [ ] Set up cron job (if using server)
- [ ] Configure Vercel Cron (if using Vercel)
- [ ] Use external scheduler (e.g., EasyCron, Cronitor)
- [ ] Set up monitoring/alerts for job failures

**Job Monitoring:**
- [ ] Log all sync attempts to database
- [ ] Alert on consecutive failures (3+ in a row)
- [ ] Track sync duration (alert if > 5 minutes)
- [ ] Monitor API rate limits

---

### 6. Monitoring & Alerts 📊

#### Key Metrics to Track
```sql
-- Sync success rate
SELECT
  last_result,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) as percentage
FROM game_platform_sync_state
WHERE last_attempt_at > NOW() - INTERVAL '7 days'
GROUP BY last_result;

-- Competitors pending sync
SELECT COUNT(*)
FROM competitors
WHERE game_platform_id IS NULL
AND status = 'complete';

-- Recent sync errors
SELECT
  c.first_name,
  c.last_name,
  g.error_message,
  g.last_attempt_at
FROM game_platform_sync_state g
JOIN competitors c ON c.game_platform_id = g.syned_user_id
WHERE g.last_result = 'failure'
AND g.last_attempt_at > NOW() - INTERVAL '24 hours'
ORDER BY g.last_attempt_at DESC;
```

#### Alert Conditions
- [ ] Sync failure rate > 10%
- [ ] No successful sync in 12 hours
- [ ] API errors (4xx, 5xx)
- [ ] Job execution time > 10 minutes
- [ ] Database connection errors

#### Logging Strategy
- [ ] Log all API requests/responses (sanitize sensitive data)
- [ ] Track sync job start/completion
- [ ] Log competitor onboarding events
- [ ] Store error messages in `game_platform_sync_error` field
- [ ] Use structured logging (JSON) for easy parsing

---

### 7. Rollback Plan 🔄

**If Issues Arise:**

#### Quick Disable
```bash
# Set environment variable
GAME_PLATFORM_INTEGRATION_ENABLED=false

# Or disable via feature flag in database
UPDATE feature_flags
SET enabled = false
WHERE name = 'game_platform_integration';
```

#### Full Rollback Procedure
1. Disable integration via env var
2. Stop background sync jobs
3. Notify MetaCTF (if data inconsistency)
4. Document issue in incident log
5. Fix issue in development/staging
6. Test fix thoroughly
7. Re-deploy when ready

---

### 8. Documentation & Training 📚

#### For Coaches
- [ ] Create user guide: "Understanding Your Dashboard"
- [ ] Document what each metric means
- [ ] Explain Flash CTF vs ODL scores
- [ ] Show how to interpret challenge categories
- [ ] Provide FAQ for common questions

#### For Support Team
- [ ] Troubleshooting guide for sync errors
- [ ] How to manually trigger sync for a competitor
- [ ] Database queries for investigating issues
- [ ] Escalation process for MetaCTF API issues
- [ ] Known limitations and workarounds

#### For Development Team
- [ ] Architecture overview (this doc + integration doc)
- [ ] API documentation (endpoint schemas)
- [ ] Database schema documentation
- [ ] Deployment procedures
- [ ] Monitoring dashboard access

---

### 9. MetaCTF Vendor Coordination 🤝

#### Pre-Launch
- [ ] Confirm production API token
- [ ] Verify rate limits (requests per minute/hour)
- [ ] Understand SLA and support channels
- [ ] Test webhook endpoints (if applicable)
- [ ] Confirm data retention policies

#### Launch Day
- [ ] Notify MetaCTF of go-live
- [ ] Have support contact ready
- [ ] Monitor API health from both sides
- [ ] Coordinate on any issues

#### Ongoing
- [ ] Quarterly sync to review integration health
- [ ] Report any API bugs/issues
- [ ] Request features as needed
- [ ] Stay updated on API changes

---

### 10. Post-Launch Checklist ✅

**Week 1:**
- [ ] Daily monitoring of sync jobs
- [ ] Review all error logs
- [ ] Spot-check 10 competitor records in MetaCTF
- [ ] Verify dashboard accuracy with coaches
- [ ] Document any issues found

**Week 2-4:**
- [ ] Reduce monitoring to every 2-3 days
- [ ] Analyze sync patterns and optimization opportunities
- [ ] Gather coach feedback
- [ ] Plan Phase D enhancements based on learnings

**Month 2+:**
- [ ] Move to weekly monitoring
- [ ] Review aggregate metrics
- [ ] Plan dashboard improvements
- [ ] Consider automation enhancements (Phase D)

---

## Open Questions / Risks

### Questions for MetaCTF
1. **Rate Limits:** What are the specific limits? (requests per minute, per hour, per day)
2. **Data Sync:** How often should we sync? Is there a recommended cadence?
3. **Webhooks:** Are there webhook events we should subscribe to?
4. **Error Handling:** What's the recommended retry strategy for failures?
5. **Bulk Operations:** Is there a batch API for syncing multiple users at once?

### Known Risks
1. **API Downtime:** No offline mode - dashboard depends on sync data
   - *Mitigation:* Cache last known good state, show stale data with warning
2. **Rate Limiting:** High volume during season could hit limits
   - *Mitigation:* Implement exponential backoff, queue-based sync
3. **Data Drift:** Manual changes in MetaCTF won't auto-sync back
   - *Mitigation:* Document reconciliation process, periodic audits
4. **ID Collisions:** If competitor IDs change in Supabase
   - *Mitigation:* Use `game_platform_id` as source of truth once set

---

## Success Metrics

### Technical Metrics
- **Sync Success Rate:** > 95%
- **Average Sync Time:** < 2 minutes for full run
- **API Response Time:** < 1 second (p95)
- **Zero Data Loss:** All challenge records preserved

### Business Metrics
- **Coach Adoption:** > 80% of coaches using dashboard
- **Data Accuracy:** < 5% discrepancy reports
- **Support Tickets:** < 10 integration-related tickets per month
- **Coach Satisfaction:** > 4.0/5.0 rating on dashboard features

---

## Next Steps

1. ✅ Complete Phase C checklist updates
2. 🔄 **YOU ARE HERE** → Review this deployment plan
3. ⏭️ Obtain production MetaCTF API credentials
4. ⏭️ Set up staging environment for final testing
5. ⏭️ Schedule pilot coach meetings
6. ⏭️ Execute Phase 1 deployment (read-only)
7. ⏭️ Execute Phase 2 pilot (1-2 coaches)
8. ⏭️ Monitor and iterate
9. ⏭️ Full rollout to all coaches
