# Admin Quick Start Guide

## 🚀 New Admin? Start Here!

This guide gets you up and running with the job queue and cron system in 5 minutes.

---

## What You Can Do

### 1. Trigger Syncs Manually (1-Click)

**Location**: Admin Tools → Job Queue

**Quick Sync Actions** card at the top has three buttons:

- **Full Sync** - Fetch everything (incremental + totals)
- **Incremental Only** - Just get new challenge solves
- **Totals Only** - Refresh aggregate stats

**How to use**:
1. Click the button you need
2. Watch the execution log
3. Jobs appear in the table below
4. Done! Wait 3-5 minutes for completion

---

### 2. Monitor Background Jobs

**Location**: Admin Tools → Job Queue

**What you see**:
- Pending (waiting)
- Running (in progress)
- Succeeded (completed)
- Failed (needs attention)

**Actions you can take**:
- Click **Retry now** on failed jobs
- Click **Cancel** to stop a job
- Toggle **Job Processing** ON/OFF to pause everything

---

### 3. Manage Schedules

**Location**: Admin Tools → Cron Jobs

**What you see**:
- All recurring schedules
- Execution history (last 50 runs)
- Active/inactive status

**Quick setup**:
1. Click **Schedule Templates** (top right)
2. Pick a pattern:
   - Competition Active (every 15 min)
   - Standard (every 30 min)
   - Coordinated Hourly (sync together)
   - Off-Season (every 4 hours)
   - Business Hours Only (9-5 weekdays)
3. Click **Copy SQL**
4. Paste in Supabase SQL Editor
5. Done!

---

## Common Tasks

### "I need fresh data right now"

1. Go to **Admin Tools → Job Queue**
2. Click **Full Sync** button
3. Wait 5 minutes
4. Refresh your dashboard

### "Background syncs are broken"

1. Go to **Admin Tools → Job Queue**
2. Check if **Job Processing** toggle is ON
3. Go to **Admin Tools → Cron Jobs**
4. Check if cron jobs are Active (green)
5. Look at **Execution History** for errors

### "I want syncs to run more/less often"

1. Go to **Admin Tools → Cron Jobs**
2. Click **Schedule Templates**
3. Pick a pattern (or create custom)
4. Copy SQL and paste in Supabase SQL Editor

### "Jobs keep failing"

1. Go to **Admin Tools → Job Queue**
2. Click **Failed** status card
3. Click on a job to see the error
4. Common fixes:
   - Network issues: Click **Retry now**
   - API credentials: Check environment variables
   - Timeout: Reduce batch size in payload

### "I need to pause everything for maintenance"

1. Go to **Admin Tools → Job Queue**
2. Toggle **Job Processing** to OFF
3. Enter reason (e.g., "Database maintenance")
4. Also disable cron jobs in Supabase (see templates for SQL)
5. When done: toggle back to ON and re-enable crons

---

## Key Concepts

### Job Queue vs Cron Jobs

**Job Queue** = Individual tasks (run once)
**Cron Jobs** = Recurring schedules (create job queue tasks automatically)

Think of it like:
- Cron = "Every Monday at 9 AM, add 'Send report' to my todo list"
- Job Queue = The actual todo list that gets worked on

### Two Types of Syncs

**Incremental Sync** (`game_platform_sync`)
- Fetches recent challenge solves
- Fast (uses `after_time_unix`)
- Sets flags for totals refresh

**Totals Sweep** (`game_platform_totals_sweep`)
- Refreshes aggregate stats
- Slower (full recalculation)
- Only processes flagged competitors

**Best practice**: Run incremental first, then totals 10 minutes later

---

## Troubleshooting Cheat Sheet

| Problem | Quick Fix |
|---------|-----------|
| Jobs stuck in Pending | Check if Job Processing is ON |
| No recent cron runs | Check if crons are Active in Cron Jobs page |
| Jobs failing repeatedly | Click on job to see error, then retry |
| Data not updating | Click Full Sync button |
| Too many API calls | Switch to Off-Season schedule template |
| Need to stop everything | Toggle Job Processing OFF |

---

## UI Navigation

```
Admin Tools
├── Job Queue (monitor individual tasks)
│   ├── Quick Sync Actions (1-click triggers)
│   ├── Job Processing toggle (pause/resume)
│   ├── Status cards (Pending, Running, etc.)
│   └── Job table (details, retry, cancel)
│
└── Cron Jobs (manage schedules)
    ├── Schedule Templates (pre-configured patterns)
    ├── Summary cards (Total, Active, Inactive, Failures)
    ├── Scheduled Jobs table (view/edit)
    └── Execution History (last 50 runs)
```

---

## Environment Setup (One-Time)

Ensure these are set in Vercel:

1. **`CRON_SECRET`** - Auto-set by Vercel ✅
2. **`JOB_QUEUE_RUNNER_SECRET`** - Must be set manually
   - Generate: `openssl rand -base64 32`
   - Add to Vercel env vars
   - Also add to Supabase Vault

---

## Next Steps

- 📖 Full manual: [admin-user-manual.md](./admin-user-manual.md)
- 🛠️ Technical docs: [vercel-job-processing-setup.md](./vercel-job-processing-setup.md)
- 📋 Playbook: Available in Job Queue page (top right button)

---

## Support Checklist

Before asking for help, check:

- [ ] Is Job Processing toggle ON?
- [ ] Are cron jobs Active (green) in Cron Jobs page?
- [ ] Any recent failures in Execution History?
- [ ] Clicked on failed job to see error message?
- [ ] Checked Vercel logs for cron execution?
- [ ] Verified environment variables are set?

If all checked and still stuck, provide:
- Screenshot of Job Queue page
- Screenshot of Cron Jobs page
- Job ID of failed job
- Error message from job details

---

**Pro Tip**: Bookmark both Admin Tools pages and check them daily during competitions!

**Last Updated**: 2025-10-06
