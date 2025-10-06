# Admin User Manual: Job Queue & Cron Management

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Understanding the Two Systems](#understanding-the-two-systems)
4. [Job Queue Management](#job-queue-management)
5. [Cron Jobs Management](#cron-jobs-management)
6. [Common Workflows](#common-workflows)
7. [Troubleshooting](#troubleshooting)
8. [FAQ](#faq)

---

## Overview

The Coach Dashboard uses two complementary systems for background job processing:

1. **Job Queue** - Individual tasks that run once (e.g., sync competitor data)
2. **Cron Jobs** - Recurring schedules that create job queue tasks automatically

Think of it like this:
- **Cron Jobs** are like setting a recurring calendar event
- **Job Queue** is the actual to-do list that gets executed

---

## Getting Started

### Accessing Admin Tools

1. Log in to the Coach Dashboard
2. Click **Admin Tools** in the sidebar
3. You'll see two relevant pages:
   - **Job Queue** - Monitor and trigger individual sync tasks
   - **Cron Jobs** - View and manage recurring schedules

### Prerequisites

- You must have **admin role** in the system
- For some cron operations, you'll need access to the Supabase Dashboard

---

## Understanding the Two Systems

### Job Queue (Admin Tools → Job Queue)

**What it does**: Shows all sync tasks (both one-time and scheduled)

**Key features**:
- View pending, running, succeeded, and failed jobs
- Trigger one-time syncs manually
- Retry failed jobs
- Cancel stuck jobs
- Pause/resume automatic processing

**When to use**:
- You need to sync data immediately
- A job failed and needs to be retried
- You want to see what's currently running
- You need to pause all background processing (e.g., during maintenance)

### Cron Jobs (Admin Tools → Cron Jobs)

**What it does**: Manages recurring schedules that create job queue tasks

**Key features**:
- View all scheduled recurring jobs
- See execution history (success/failures)
- Enable/disable schedules
- Monitor job health

**When to use**:
- You want to change how often syncs happen
- You need to temporarily stop recurring syncs
- You want to see if scheduled jobs are running on time
- You're investigating why data isn't syncing automatically

---

## Job Queue Management

### Viewing Jobs

Navigate to **Admin Tools → Job Queue**

**Dashboard Overview**:
- **Pending**: Jobs waiting to run
- **Running**: Jobs currently executing
- **Succeeded**: Completed successfully
- **Failed**: Errors occurred (may retry automatically)
- **Cancelled**: Manually stopped

**Job Details**:
Each job shows:
- **ID**: Unique identifier
- **Task**: Type of sync (`game_platform_sync` or `game_platform_totals_sweep`)
- **Status**: Current state
- **Attempts**: How many times it's been tried (e.g., "2 / 3" means 2nd attempt, max 3)
- **Next Run**: When it will run (or when it ran)
- **Last Error**: Error message if it failed

### Triggering Manual Syncs

#### Option 1: Quick Sync Actions (Recommended for Admins)

**New Feature**: The Job Queue page now includes one-click sync buttons!

Navigate to **Admin Tools → Job Queue** and look for the **Quick Sync Actions** card at the top.

**Available Actions**:

1. **Full Sync (Incremental + Totals)**
   - Triggers incremental sync immediately
   - Waits 30 seconds
   - Triggers totals sweep automatically
   - Use for: Complete data refresh

2. **Incremental Sync Only**
   - Fetches recent challenge solves
   - Sets totals refresh flags
   - Use for: Quick updates during active competitions

3. **Totals Sweep Only**
   - Refreshes aggregate stats for flagged competitors
   - Use for: Fixing stats without re-fetching all data

**How it works**:
- Click the button for your desired sync pattern
- Watch the execution log for status updates
- Jobs appear in the Job Queue table below within seconds
- Refresh the page to see job progress

#### Option 2: Via API (For Automation/Scripts)

**Incremental Sync** (fetch recent activity):
```bash
curl -X POST https://your-app.vercel.app/api/admin/jobs/trigger-sync \
  -H "Content-Type: application/json" \
  -H "Cookie: your-auth-cookie" \
  -d '{
    "dryRun": false,
    "coachId": null
  }'
```

**Totals Sweep** (refresh aggregate stats):
```bash
curl -X POST https://your-app.vercel.app/api/admin/jobs/trigger-totals-sweep \
  -H "Content-Type: application/json" \
  -H "Cookie: your-auth-cookie" \
  -d '{
    "dryRun": false,
    "coachId": null,
    "batchSize": 100
  }'
```

**Parameters**:
- `dryRun` (boolean): `true` = preview changes without saving, `false` = actually sync
- `coachId` (string|null): Limit sync to one coach's competitors, or `null` for all coaches
- `batchSize` (number, totals sweep only): How many competitors to process per batch

#### Option 3: Advanced API Usage

For scripts and automation, you can also call the API endpoints directly (see Option 2 above for examples).

### Retry Failed Jobs

If a job fails but hasn't reached max attempts:

1. Find the job in the **Failed** tab
2. Click **Retry now**
3. The job will be moved to **Pending** and run on the next worker cycle (within 5 minutes)

### Cancel Jobs

To stop a job that's stuck or no longer needed:

1. Find the job in the **Pending** or **Running** tab
2. Click **Cancel**
3. The job status changes to **Cancelled** and won't run

### Pause All Job Processing

**Emergency stop** (e.g., API is down, data corruption detected):

1. Go to **Admin Tools → Job Queue**
2. Find the **Job Processing** toggle at the top
3. Switch to **OFF**
4. Enter a reason (e.g., "Game Platform API maintenance")
5. Click **Confirm**

**To resume**:
1. Switch the toggle back to **ON**
2. All pending jobs will start processing again within 5 minutes

**⚠️ Important**: This only pauses the job worker. Cron jobs will continue creating new job queue entries, but they won't execute until you turn processing back on.

---

## Cron Jobs Management

### Viewing Cron Schedules

Navigate to **Admin Tools → Cron Jobs**

**Dashboard Overview**:
- **Total Jobs**: Number of recurring schedules configured
- **Active**: Currently enabled schedules
- **Inactive**: Disabled schedules (not creating new jobs)
- **Recent Failures**: Failed executions in the last 50 runs

**Scheduled Jobs Table**:
Each cron job shows:
- **Job Name**: Identifier (e.g., `game_platform_sync_incremental`)
- **Schedule**: Cron expression (e.g., `*/30 * * * *` = every 30 minutes)
- **Command**: SQL command that creates the job queue entry
- **Status**: Active (green) or Inactive (gray)

**Execution History**:
Shows the last 50 runs:
- **Job Name**: Which schedule ran
- **Status**: Succeeded or Failed
- **Duration**: How long it took
- **Start/End Time**: Execution timestamps
- **Details**: Click to see full error messages

### Understanding Cron Schedules

Cron expressions have 5 fields: `minute hour day month weekday`

**Common patterns**:
- `*/5 * * * *` = Every 5 minutes
- `*/30 * * * *` = Every 30 minutes
- `0 * * * *` = Every hour (at minute 0)
- `0 */2 * * *` = Every 2 hours
- `0 3 * * *` = Daily at 3:00 AM
- `0 0 * * 0` = Weekly on Sunday at midnight

**Current Setup**:
1. `game_platform_sync_incremental` - Every 30 minutes (fetches new challenge solves)
2. `game_platform_totals_sweep_hourly` - Every hour (refreshes aggregate stats)
3. `job_queue_cleanup_daily` - Daily at 3:15 AM (deletes old succeeded jobs)

### Enabling/Disabling Cron Jobs

**⚠️ Note**: Due to Supabase security restrictions, you cannot toggle cron jobs directly in the UI. Instead:

1. Click the **toggle switch** next to the job
2. A dialog will appear with SQL code already copied to your clipboard
3. Go to **Supabase Dashboard** → **SQL Editor**
4. Paste and run the SQL command:
   ```sql
   UPDATE cron.job SET active = false WHERE jobname = 'game_platform_sync_incremental';
   ```
5. Refresh the Cron Jobs page to see the updated status

**Use cases**:
- **Disable sync during API maintenance**: Turn off `game_platform_sync_incremental`
- **Reduce database load**: Temporarily disable `game_platform_totals_sweep_hourly`
- **Testing**: Disable production crons while testing new job handlers

### Monitoring Cron Health

**Check for failures**:
1. Look at the **Recent Failures** card (top of page)
2. Scroll to **Execution History**
3. Click on any failed run to see error details

**Common failure reasons**:
- Database timeout (job took too long)
- Network error connecting to Game Platform API
- Job queue table locked (too many concurrent jobs)
- Invalid cron syntax or missing database function

**What to do**:
- If 1-2 failures: Usually self-corrects on next run
- If repeated failures: Check [Troubleshooting](#troubleshooting) section
- If all jobs failing: Check Supabase status page

---

## Common Workflows

### Scenario 1: Manually Sync All Data Right Now

**Goal**: Fetch latest stats immediately (not waiting for next scheduled sync)

**Steps** (Using Quick Sync Actions):
1. Go to **Admin Tools → Job Queue**
2. Find the **Quick Sync Actions** card
3. Click **Full Sync (Incremental + Totals)**
4. Watch the execution log for status
5. Jobs will appear in the table below
6. Wait 3-5 minutes for completion

**Alternative** (Using API):
1. Trigger incremental sync:
   ```bash
   curl -X POST https://your-app.vercel.app/api/admin/jobs/trigger-sync \
     -H "Content-Type: application/json" \
     -H "Cookie: your-auth-cookie" \
     -d '{"dryRun": false}'
   ```
2. Wait 5 minutes for it to complete
3. Trigger totals sweep:
   ```bash
   curl -X POST https://your-app.vercel.app/api/admin/jobs/trigger-totals-sweep \
     -H "Content-Type: application/json" \
     -H "Cookie: your-auth-cookie" \
     -d '{"dryRun": false}'
   ```
4. Monitor progress in **Admin Tools → Job Queue**

### Scenario 2: Sync Only One Coach's Data

**Goal**: Test sync for a specific coach without affecting others

**Steps**:
1. Get the coach's UUID from the `profiles` table
2. Trigger sync with `coachId` parameter:
   ```bash
   curl -X POST https://your-app.vercel.app/api/admin/jobs/trigger-sync \
     -H "Content-Type: application/json" \
     -H "Cookie: your-auth-cookie" \
     -d '{
       "dryRun": false,
       "coachId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
     }'
   ```

### Scenario 3: Preview Sync Changes Without Writing

**Goal**: See what would change without actually updating the database

**Steps**:
1. Trigger sync with `dryRun: true`:
   ```bash
   curl -X POST https://your-app.vercel.app/api/admin/jobs/trigger-sync \
     -H "Content-Type: application/json" \
     -H "Cookie: your-auth-cookie" \
     -d '{"dryRun": true}'
   ```
2. Check job output in **Job Queue** page (click on job to see results)
3. Review logs to see what would have been updated

### Scenario 4: Pause Syncs During Maintenance

**Goal**: Stop all background syncs while you perform database maintenance

**Steps**:
1. Go to **Admin Tools → Job Queue**
2. Toggle **Job Processing** to **OFF**
3. Enter reason: "Database maintenance in progress"
4. Go to **Admin Tools → Cron Jobs**
5. Disable all game platform crons (copy/paste SQL in Supabase)
6. Perform your maintenance
7. Re-enable cron jobs in Supabase
8. Toggle **Job Processing** back to **ON**

### Scenario 5: Retry All Failed Jobs

**Goal**: Re-run jobs that failed due to temporary API issues

**Steps**:
1. Go to **Admin Tools → Job Queue**
2. Click on the **Failed** status card
3. For each failed job, click **Retry now**
4. Switch back to **Pending** to monitor

### Scenario 6: Create Coordinated Sync Pattern

**Goal**: Ensure incremental sync and totals sweep run together every hour

**New Feature**: Use the **Schedule Templates** button!

**Using Schedule Templates** (Easiest Method):

1. Go to **Admin Tools → Cron Jobs**
2. Click **Schedule Templates** button (top right)
3. Browse pre-configured patterns:
   - **Competition Active**: Every 15 min (high frequency)
   - **Standard Operations**: Current setup (30 min / hourly)
   - **Coordinated Hourly**: Sync at :00, totals at :10
   - **Off-Season**: Every 4 hours (low frequency)
   - **Business Hours Only**: 9-5 weekdays only
4. Click **Copy SQL** on your preferred pattern
5. Go to **Supabase Dashboard → SQL Editor**
6. Paste and run the SQL
7. Verify in the Cron Jobs table

**Manual Method** (For Custom Schedules):

1. Go to **Supabase Dashboard → SQL Editor**
2. Update incremental sync to run hourly at minute 5:
   ```sql
   SELECT cron.alter_job(
     job_id := (SELECT jobid FROM cron.job WHERE jobname = 'game_platform_sync_incremental'),
     schedule := '5 * * * *'
   );
   ```
3. This ensures:
   - Minute 0: Totals sweep starts
   - Minute 5: Incremental sync starts
   - They don't overlap and compete for resources

**Best Practices for Coordination**:
- **Sequential**: Incremental first (minute 0), then totals (minute 10)
  - Ensures totals see latest incremental data
- **Offset**: Separate by 5-10 minutes to avoid DB locks
- **Peak hours**: Run more frequent syncs during competition hours
- **Off-hours**: Run cleanup jobs during low-traffic times (e.g., 3 AM)

---

## Troubleshooting

### Jobs Stuck in "Pending"

**Symptoms**: Jobs sit in pending for hours

**Causes**:
- Job processing is paused
- Vercel cron stopped running
- Worker endpoint returning errors

**Solutions**:
1. Check if processing is enabled (toggle at top of Job Queue page)
2. Check Vercel logs for cron execution errors
3. Manually trigger the worker:
   ```bash
   curl -X POST https://your-app.vercel.app/api/jobs/run \
     -H "x-job-runner-secret: YOUR_SECRET"
   ```

### Jobs Failing with "Out of Memory"

**Symptoms**: Jobs fail with OOM errors

**Causes**:
- Too many competitors to sync at once
- Vercel function memory limit (1GB on Pro)

**Solutions**:
1. Reduce batch size:
   ```bash
   curl -X POST .../trigger-totals-sweep \
     -d '{"batchSize": 50}'
   ```
2. Enable `coachId` filtering to process in smaller chunks
3. Upgrade Vercel plan for higher memory limits

### Cron Jobs Not Running on Schedule

**Symptoms**: Execution history shows gaps or no recent runs

**Causes**:
- Cron job is disabled
- Supabase pg_cron stopped
- Invalid cron expression

**Solutions**:
1. Check if cron is active: **Admin Tools → Cron Jobs**
2. Verify schedule syntax: [crontab.guru](https://crontab.guru)
3. Check Supabase status page for outages
4. Test manually:
   ```sql
   SELECT public.job_queue_enqueue(
     p_task_type := 'game_platform_sync',
     p_payload := '{}'::jsonb
   );
   ```

### Repeated Failures for Same Job

**Symptoms**: Job fails, retries, fails again (hits max attempts)

**Causes**:
- Game Platform API down
- Invalid API credentials
- Network timeout
- Data validation error

**Solutions**:
1. Click on the failed job to see full error message
2. Check error type:
   - **401/403**: API credentials expired (update in env vars)
   - **429**: Rate limiting (reduce sync frequency)
   - **500**: API outage (wait and retry later)
   - **Timeout**: Increase function timeout or reduce batch size
3. Fix the underlying issue
4. Click **Retry now** to re-run

### Data Not Appearing in Dashboard

**Symptoms**: Jobs succeed but competitor stats don't update

**Causes**:
- Sync ran with `dryRun: true`
- No new data available from API
- Cache not invalidated

**Solutions**:
1. Check job output to see if any records were updated
2. Verify `dryRun` was `false`
3. Check if competitor is linked to Game Platform (email must match)
4. Refresh the dashboard page (hard refresh: Cmd+Shift+R)

---

## FAQ

### How often should syncs run?

**Recommended**:
- **During competition**: Every 15-30 minutes
- **Off-season**: Every 2-4 hours
- **Maintenance**: Pause completely

**Adjust based on**:
- API rate limits
- Database load
- User expectations for data freshness

### Can I run sync and totals sweep together?

Yes! Two approaches:

**Approach 1: Sequential in same hour**
- Minute 0: Incremental sync
- Minute 10: Totals sweep (after sync completes)

**Approach 2: Same cadence, different phases**
- Incremental: `*/30 * * * *` (every 30 min)
- Totals: `15,45 * * * *` (15 minutes after each sync)

### What happens if a job is already running when the next one starts?

**Job Queue**: Uses database locks (`FOR UPDATE SKIP LOCKED`)
- Already running jobs are skipped
- Next job in queue is claimed instead
- No duplicates execute

**Cron Jobs**: Each cron execution creates a new job queue entry
- Multiple pending jobs can exist
- Worker processes them one at a time
- Not a problem unless hundreds pile up

### How do I change how often a cron runs?

**Steps**:
1. Go to **Supabase Dashboard → SQL Editor**
2. Run this SQL (replace values):
   ```sql
   SELECT cron.alter_job(
     job_id := (SELECT jobid FROM cron.job WHERE jobname = 'your_job_name'),
     schedule := '*/15 * * * *'  -- Your new schedule
   );
   ```
3. Verify in **Admin Tools → Cron Jobs**

**⚠️ Note**: Cannot be done through the dashboard UI (Supabase limitation)

### Can I delete old jobs?

**Automatic**: `job_queue_cleanup_daily` cron deletes succeeded jobs older than 14 days

**Manual deletion**:
1. Go to **Supabase Dashboard → SQL Editor**
2. Delete specific jobs:
   ```sql
   DELETE FROM job_queue WHERE status = 'succeeded' AND completed_at < now() - interval '7 days';
   ```

**⚠️ Warning**: Don't delete `failed` jobs until you've investigated errors!

### What's the difference between disabling a cron vs pausing job processing?

**Disable cron**:
- Stops new jobs from being created
- Existing pending jobs still run
- Use for: "Stop creating more work"

**Pause processing**:
- Stops worker from executing jobs
- Crons continue creating pending jobs (they pile up)
- Use for: "Stop all activity immediately"

**Both together**:
- Complete shutdown of background processing
- Use during maintenance windows

### Can I create a new cron job without a database migration?

Yes! Use the Supabase dashboard:

1. Go to **Supabase Dashboard → SQL Editor**
2. Run:
   ```sql
   SELECT cron.schedule(
     job_name => 'my_custom_sync',
     schedule => '0 */4 * * *',  -- Every 4 hours
     command => $$
       SELECT public.job_queue_enqueue(
         p_task_type := 'game_platform_sync',
         p_payload := '{"coachId": "specific-uuid"}'::jsonb,
         p_run_at := now(),
         p_max_attempts := 3
       );
     $$
   );
   ```
3. Refresh **Admin Tools → Cron Jobs** to see it

**Best practice**: Add a migration file for version control

### How do I get my auth cookie for API calls?

**Using Browser DevTools**:
1. Log in to the dashboard
2. Open DevTools (F12)
3. Go to **Application** → **Cookies**
4. Copy the value of cookie (usually starts with `sb-`)
5. Use in curl: `-H "Cookie: sb-xxx=your-token-here"`

**Alternative**: Use session token:
```bash
curl ... -H "Authorization: Bearer YOUR_SUPABASE_SESSION_TOKEN"
```

---

## Quick Reference

### Key URLs

- Job Queue: `/dashboard/admin-tools/jobs`
- Cron Jobs: `/dashboard/admin-tools/cron-jobs`
- Trigger Sync: `POST /api/admin/jobs/trigger-sync`
- Trigger Totals: `POST /api/admin/jobs/trigger-totals-sweep`
- Worker: `POST /api/jobs/run`

### Job Types

- `game_platform_sync`: Incremental sync (recent challenge solves)
- `game_platform_totals_sweep`: Refresh aggregate stats

### Job Statuses

- `pending`: Waiting to run
- `processing`: Currently running
- `succeeded`: Completed successfully
- `failed`: Error occurred (may retry)
- `cancelled`: Manually stopped

### Environment Variables (Vercel)

- `CRON_SECRET`: Auto-set by Vercel for cron auth
- `JOB_QUEUE_RUNNER_SECRET`: Custom secret for manual triggers

### Support

- **Documentation**: `/docs/cron-jobs/`
- **Playbook**: Available in Job Queue page (top right)
- **Logs**: Vercel Dashboard → Your Project → Logs
- **Database**: Supabase Dashboard → SQL Editor

---

**Last Updated**: 2025-10-06
**Version**: 1.0
