# Pre-Production Tasks - Priority List

## Immediate (Before Production Deploy)

### 1. API Credentials & Testing 🔑
**Priority:** CRITICAL
**Owner:** DevOps/Platform Admin

- [ ] **Obtain production MetaCTF API token**
  - Contact: MetaCTF support/account manager
  - Test in Postman/curl before adding to env vars
  - Document token rotation policy

- [ ] **Test production API endpoint**
  ```bash
  # Test authentication
  curl -H "Authorization: Bearer $TOKEN" \
    https://api.metactf.com/integrations/syned/v1/

  # Should return: {"status": "ok"} or similar
  ```

- [ ] **Verify API rate limits**
  - Get official limits from MetaCTF
  - Document in code comments
  - Plan sync frequency accordingly

**Estimated Time:** 1-2 days (waiting for vendor response)

---

### 2. Production Environment Setup ⚙️
**Priority:** CRITICAL
**Owner:** DevOps

- [ ] **Configure environment variables**
  ```bash
  # Production .env (or deployment platform secrets)
  GAME_PLATFORM_API_BASE_URL=https://api.metactf.com/integrations/syned/v1
  GAME_PLATFORM_API_TOKEN=<production_token>
  GAME_PLATFORM_INTEGRATION_ENABLED=false  # Start disabled
  INTERNAL_SYNC_SECRET=<generate_strong_secret>
  ```

- [ ] **Verify database migration status**
  ```sql
  -- Check migration applied
  SELECT * FROM _prisma_migrations
  WHERE name LIKE '%game_platform%'
  ORDER BY finished_at DESC;
  ```

- [ ] **Clean test data**
  ```sql
  -- Remove any mock data
  DELETE FROM game_platform_challenge_solves WHERE syned_user_id LIKE '%mock%';
  DELETE FROM game_platform_sync_state WHERE 1=1;  -- Fresh start
  ```

**Estimated Time:** 2-4 hours

---

### 3. Monitoring Setup 📊
**Priority:** HIGH
**Owner:** DevOps/Engineering

- [ ] **Set up log aggregation**
  - Configure Sentry/LogRocket/DataDog (if not already done)
  - Add structured logging to sync jobs
  - Tag MetaCTF API calls for easy filtering

- [ ] **Create monitoring dashboard**
  - Sync job success rate
  - API response times
  - Error count by type
  - Competitors pending sync

- [ ] **Configure alerts**
  - Sync failure rate > 10%
  - No successful sync in 12 hours
  - API 5xx errors
  - Job timeout (> 10 minutes)

**Estimated Time:** 4-6 hours

---

### 4. Pilot Coach Selection & Preparation 👥
**Priority:** HIGH
**Owner:** Product/Customer Success

- [ ] **Select 1-2 pilot coaches**
  - Criteria:
    - 5-10 competitors (manageable size)
    - Active users (logging in regularly)
    - Willing to provide feedback
    - Comfortable with tech (can spot issues)

- [ ] **Brief pilot coaches**
  - What to expect
  - What to watch for
  - How to report issues
  - Timeline (1-2 week pilot)

- [ ] **Prepare competitor data**
  - Ensure all pilot competitors have:
    - Complete profiles
    - status = 'complete'
    - Valid email addresses

**Estimated Time:** 1-2 days

---

## Important (Production Readiness)

### 5. Error Handling Improvements 🐛
**Priority:** MEDIUM-HIGH
**Owner:** Engineering

- [ ] **Add retry logic verification**
  - Verify exponential backoff is working
  - Test with mock 500 errors
  - Ensure max retry limit prevents infinite loops

- [ ] **Improve error messages**
  ```typescript
  // Make errors actionable
  // Bad:  "Sync failed"
  // Good: "Could not sync competitor due to missing email. Please add email and retry."
  ```

- [ ] **Add error recovery UI** (if time permits)
  - Retry button in admin UI
  - Clear error button
  - Bulk retry for multiple failures

**Estimated Time:** 4-8 hours

---

### 6. Documentation 📚
**Priority:** MEDIUM
**Owner:** Engineering/Product

- [ ] **Update user-facing docs**
  - What is MetaCTF integration?
  - How to interpret dashboard metrics
  - Troubleshooting common issues

- [ ] **Create admin runbook**
  - How to manually sync a competitor
  - How to investigate sync failures
  - Common SQL queries for support
  - Rollback procedures

- [ ] **Document API integration**
  - Update `game-platform-integration.md` with production notes
  - Add troubleshooting section
  - Document rate limits and best practices

**Estimated Time:** 4-6 hours

---

### 7. Load Testing 🔥
**Priority:** MEDIUM
**Owner:** Engineering

- [ ] **Test sync job performance**
  - Time a full sync with mock data (all 18 competitors)
  - Estimate time for production (100+ competitors)
  - Verify database can handle volume

- [ ] **Simulate failure scenarios**
  - Network timeout during sync
  - Partial sync completion (some succeed, some fail)
  - Database connection lost mid-sync
  - API rate limit hit

- [ ] **Optimize if needed**
  - Add database indexes if queries are slow
  - Consider batch processing if single-threaded is too slow
  - Implement request throttling if hitting rate limits

**Estimated Time:** 4-8 hours

---

## Nice-to-Have (Post-Launch)

### 8. UI Polish ✨
**Priority:** LOW (Phase D)
**Owner:** Engineering/Design

- [ ] **Add loading states**
  - Skeleton loaders for dashboard
  - Progress indicator for sync jobs
  - "Last synced X minutes ago" timestamps

- [ ] **Add empty states**
  - "No challenges completed yet" for new competitors
  - "Sync pending" for competitors awaiting first sync

- [ ] **Improve drill-down UX**
  - Add filtering by category
  - Sort by date/points
  - Export to CSV

**Estimated Time:** 8-12 hours

---

### 9. Advanced Features 🚀
**Priority:** LOW (Phase D)
**Owner:** Engineering

- [ ] **Real-time sync**
  - WebSocket connection to MetaCTF (if supported)
  - Push updates to dashboard
  - Notify coaches of new achievements

- [ ] **Predictive analytics**
  - Identify struggling competitors
  - Recommend focus areas
  - Compare to peer performance

- [ ] **Automated reporting**
  - Weekly email summaries
  - Coach performance reports
  - Competitor progress reports

**Estimated Time:** 20+ hours (future sprint)

---

## Deployment Sequence

### Phase 0: Pre-Launch (This Week)
1. ✅ Complete Phase C checklist
2. ⏭️ Obtain production credentials (Task #1)
3. ⏭️ Set up environment (Task #2)
4. ⏭️ Configure monitoring (Task #3)
5. ⏭️ Select pilot coaches (Task #4)

### Phase 1: Soft Launch (Week 1)
1. Deploy with `GAME_PLATFORM_INTEGRATION_ENABLED=false`
2. Verify app stability
3. Enable for pilot coaches only
4. Monitor for 48 hours

### Phase 2: Pilot Expansion (Week 2)
1. Get pilot feedback
2. Fix any issues found
3. Enable for 10% of coaches
4. Monitor for 48 hours

### Phase 3: Full Rollout (Week 3-4)
1. Enable for 50% of coaches
2. Monitor for 24 hours
3. Enable for 100% of coaches
4. Celebrate! 🎉

---

## Quick Reference

### Critical Path Items (Must Have)
- [ ] Production API token (Task #1)
- [ ] Environment configuration (Task #2)
- [ ] Database migration verified (Task #2)
- [ ] Basic monitoring (Task #3)
- [ ] Pilot coaches selected (Task #4)

### Recommended Items (Should Have)
- [ ] Error handling improvements (Task #5)
- [ ] Admin documentation (Task #6)
- [ ] Load testing (Task #7)

### Optional Items (Nice to Have)
- [ ] UI polish (Task #8)
- [ ] Advanced features (Task #9)

---

## Blockers & Dependencies

### External Dependencies
1. **MetaCTF API Token** - Waiting on vendor
   - Risk: Could delay launch by days/weeks
   - Mitigation: Start request immediately, escalate if delayed

2. **Pilot Coach Availability** - Need coach commitment
   - Risk: Pilots may be too busy
   - Mitigation: Offer incentive (early access, feedback credit)

### Internal Dependencies
1. **Database Migration** - Must be applied before deploy
   - Risk: Migration could fail in production
   - Mitigation: Test in staging first, have rollback plan

2. **Monitoring Infrastructure** - Need logs/alerts working
   - Risk: Issues go unnoticed
   - Mitigation: Manual monitoring first 48 hours if needed

---

## Success Criteria

### Ready for Pilot
- ✅ All "Critical Path" items complete
- ✅ Pilot coaches onboarded and briefed
- ✅ Basic monitoring in place
- ✅ Rollback plan documented

### Ready for Production
- ✅ Pilot successful (no major issues)
- ✅ All "Critical Path" + "Recommended" items complete
- ✅ Team trained on support procedures
- ✅ Documentation complete

### Production Stable
- ✅ 7 days with >95% sync success rate
- ✅ < 5 support tickets per week
- ✅ Positive coach feedback
- ✅ No critical bugs or outages