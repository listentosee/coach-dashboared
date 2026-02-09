# Competitor Announcement Email Project Plan

## Objective
- Add an admin-only messaging capability to send a **Competitor Announcement** email to every student currently on the game platform.
- Reuse the existing composer UI flow while translating announcement content into SendGrid email format.
- Target each student using the same email used for game-platform onboarding.

## Success Criteria
- Admin can select Competitor Announcement from composer and submit subject/body.
- System resolves eligible recipients (students on game platform) and sends via SendGrid.
- Sends use SendGrid's `personalizations` array for batch delivery (up to 1,000 per API call).
- Campaign/reporting view exposes queued/sent/failed/skipped counts.
- No recipient list exposure between students; one outbound email per recipient.
- Webhook events update per-recipient delivery status.

## Scope
### In Scope
- Composer UI update with new `competitor_announcement` mode.
- New server API for competitor announcement dispatch.
- Recipient targeting query and onboarding-email resolution.
- Job handler that calls SendGrid v3 API directly with personalizations.
- SendGrid event webhook extension for delivery/failure feedback.
- Data model for campaign + recipient status tracking.
- Confirmation UX with dry-run preview before bulk send.
- Markdown-to-HTML conversion for email body.
- Feature flag rollout and tests.

### Out of Scope (Phase 1)
- Attachments in competitor announcement emails.
- Rich template builder UI.
- Non-admin sender permissions.
- Campaign analytics dashboard (minimal status view only for MVP).

## Architecture Decisions
- Keep existing `announcement` in-app conversation behavior unchanged.
- Implement competitor email send as a separate campaign pipeline instead of overloading `create_announcement_and_broadcast`.
- Call SendGrid v3 API directly from the Next.js job handler — no edge function for bulk sends.
- Use SendGrid `personalizations` array (up to 1,000 recipients per API call) to offload delivery, retry, and bounce handling to SendGrid.
- Persist onboarding email source on competitor record to make recipient targeting deterministic.
- **Email validation before SendGrid submission is critical** — SendGrid rejects the entire API call (all personalizations) if any single email address has invalid syntax. The recipient resolver must validate email format and skip invalid addresses before building the personalizations array.
- **Markdown-to-HTML conversion**: The project already has `react-markdown` (client-side) and `@uiw/react-md-editor` but no server-side markdown library. Add a lightweight server-side library (e.g., `marked`) for converting composer markdown to email HTML.
- **Campaign counters derived, not incremented**: Rather than maintaining `total_delivered`/`total_bounced` counters on the campaigns table (which risks lost updates under concurrent webhook events), derive counts from `competitor_announcement_recipients` status with a Postgres function. This matches the codebase pattern (e.g., unread counts are derived in `list_conversations_enriched`).

## Implementation Phases

## Phase 0: Alignment and Guardrails
**Goal:** Lock payload contract and rollout constraints before schema/API work.

### Checklist
- [ ] Confirm final audience definition: active game-platform competitors only (`competitors.game_platform_id IS NOT NULL`).
- [ ] Confirm onboarding email precedence: `game_platform_onboarding_email`, fallback `email_personal || email_school`.
- [ ] Confirm sender identity policy (from name/from email for competitor announcements).
- [ ] Confirm whether subject prefix is required (e.g., `[Mayors Cup]`).
- [ ] Confirm per-run max recipient safety threshold and required confirmation UX.
- [ ] Create SendGrid unsubscribe group for competitor announcements. Record group ID for `asm.group_id`.
- [ ] Ensure `SENDGRID_API_KEY` is in Vercel environment variables (currently only in Supabase edge function secrets).

### Exit Criteria
- [ ] Approved contract for request/response payload and recipient rules.
- [ ] Approved rollout flag name and environments.
- [ ] SendGrid unsubscribe group created with group ID recorded.

---

## Phase 1: Data Model and Migration
**Goal:** Add persistence for campaign tracking, recipient-level outcomes, and onboarding email.

### Schema Work

#### `competitor_announcement_campaigns` table
```sql
id                  uuid PRIMARY KEY DEFAULT gen_random_uuid()
subject             text NOT NULL
body_markdown       text NOT NULL
body_html           text NOT NULL
created_by          uuid NOT NULL REFERENCES auth.users(id)
status              text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','sending','sent','failed'))
created_at          timestamptz NOT NULL DEFAULT now()
completed_at        timestamptz
```
Note: Delivery counters (total_delivered, total_bounced, etc.) are **not stored** on this table. They are derived on-read from `competitor_announcement_recipients` via a Postgres function to avoid concurrent update issues from webhook events.

#### `competitor_announcement_recipients` table
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
campaign_id     uuid NOT NULL REFERENCES competitor_announcement_campaigns(id)
competitor_id   uuid NOT NULL REFERENCES competitors(id)
email           text NOT NULL
status          text NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','delivered','bounced','dropped','blocked','skipped'))
skip_reason     text
error           text
created_at      timestamptz NOT NULL DEFAULT now()
updated_at      timestamptz NOT NULL DEFAULT now()
```

#### `competitors` table addition
```sql
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS
  game_platform_onboarding_email text;
```

#### Backfill existing competitors
```sql
UPDATE competitors
SET game_platform_onboarding_email = COALESCE(email_personal, email_school)
WHERE game_platform_id IS NOT NULL
  AND game_platform_onboarding_email IS NULL;
```

#### `get_campaign_stats` function (derived counters)
```sql
CREATE OR REPLACE FUNCTION get_campaign_stats(p_campaign_id uuid)
RETURNS TABLE (
  total_recipients bigint,
  total_queued bigint,
  total_delivered bigint,
  total_bounced bigint,
  total_dropped bigint,
  total_blocked bigint,
  total_skipped bigint
)
LANGUAGE sql STABLE
AS $$
  SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE status = 'queued')::bigint,
    COUNT(*) FILTER (WHERE status = 'delivered')::bigint,
    COUNT(*) FILTER (WHERE status = 'bounced')::bigint,
    COUNT(*) FILTER (WHERE status = 'dropped')::bigint,
    COUNT(*) FILTER (WHERE status = 'blocked')::bigint,
    COUNT(*) FILTER (WHERE status = 'skipped')::bigint
  FROM competitor_announcement_recipients
  WHERE campaign_id = p_campaign_id;
$$;
```

#### Indexes
- `competitor_announcement_recipients(campaign_id)`
- `competitor_announcement_recipients(campaign_id, status)`

#### RLS
- Admin read on both campaign tables; service-role write.
- No coach/competitor access.

### File Targets
- [x] `supabase/migrations/<timestamp>_competitor_announcement_campaigns.sql`

### Exit Criteria
- [ ] Migration applies cleanly in dev.
- [ ] Campaign and recipient tables queryable with expected constraints.
- [ ] Existing game-platform competitors backfilled with onboarding email.

---

## Phase 2: Onboarding Email Persistence in Code
**Goal:** Ensure future onboarded competitors store the email used.

### Checklist
- [x] Update onboarding flow to persist chosen email to `game_platform_onboarding_email`.
- [x] Add null/invalid email skip classification logic for recipient resolution.

### File Targets
- [x] `lib/integrations/game-platform/service.ts` — after successful onboarding, write `email_personal || email_school` to `game_platform_onboarding_email`

### Exit Criteria
- [ ] New onboarded competitors store onboarding email field.

---

## Phase 3: Dispatch API and Recipient Resolution
**Goal:** Add admin-only route that creates a campaign and enqueues delivery.

### Checklist
- [x] Create `POST /api/messaging/announcements/competitors/send`.
- [x] Enforce admin auth check via `supabase.auth.getUser()` + `isUserAdmin()`.
- [x] Validate payload with Zod: `{ subject: string, body: string, dryRun?: boolean }`.
- [x] Convert markdown body to HTML. The project has `react-markdown` + `remark-gfm` + `remark-breaks` for client-side rendering, but no server-side library. Add `marked` (lightweight, no React dependency) for server-side conversion. Configure with GFM support to match client preview behavior.
- [x] Resolve recipients:
  - [x] Filter: `competitors WHERE game_platform_id IS NOT NULL`.
  - [x] Resolve email: `game_platform_onboarding_email ?? email_personal ?? email_school`.
  - [x] Skip competitors with no resolvable email (record skip reason).
  - [x] **Validate email format** before including in batch — SendGrid rejects the entire API call if any email has invalid syntax. Use a regex or Zod email validator. Skip invalid emails with reason `'invalid_email_format'`.
- [x] If `dryRun`: return `{ recipientCount, skippedCount, skippedReasons }` — no campaign created.
- [x] If not dry run: insert campaign row + recipient rows with initial statuses.
- [x] Enqueue `competitor_announcement_dispatch` job with `{ campaignId }`.
- [x] Return `{ campaignId, recipientCount, skippedCount }`.

### File Targets
- [x] `app/api/messaging/announcements/competitors/send/route.ts`
- [x] `lib/messaging/competitor-announcement.ts` (recipient resolver + shared types)

### Exit Criteria
- [x] API returns campaign ID and queued/skipped counts.
- [x] Non-admin users receive `403`.
- [x] Dry-run mode returns accurate counts without creating records.

---

## Phase 4: SendGrid Direct Dispatch (Job Handler)
**Goal:** Send campaigns via SendGrid `personalizations` array — 1-2 API calls for up to 2,000 recipients.

### Checklist
- [x] Add new job task type: `competitor_announcement_dispatch` to `lib/jobs/types.ts`.
- [x] Register handler in `lib/jobs/handlers/index.ts`.
- [x] Implement handler in `lib/jobs/handlers/competitorAnnouncementDispatch.ts`:
  1. Load campaign + recipients WHERE `status = 'queued'`.
  2. Build `personalizations` array (up to 1,000 per batch):
     ```ts
     personalizations: recipients.map(r => ({
       to: [{ email: r.email }],
       custom_args: {
         email_type: 'competitor_announcement',
         campaign_id: campaignId,
         competitor_id: r.competitor_id
       }
     }))
     ```
  3. Call SendGrid v3 API directly (`POST https://api.sendgrid.com/v3/mail/send`):
     ```ts
     {
       personalizations,
       from: { email: SENDGRID_FROM_EMAIL, name: SENDGRID_FROM_NAME },
       subject,
       content: [{ type: 'text/html', value: bodyHtml }],
       asm: { group_id: SENDGRID_UNSUBSCRIBE_GROUP_ID }
     }
     ```
  4. For >1,000 recipients: split into batches of 1,000.
  5. On success (202): campaign status → `sending`.
  6. On failure: update recipients to `failed` with error, campaign to `failed`.

### What SendGrid handles after submission
- Individual delivery per recipient.
- Transient retry logic.
- Bounce/block/drop detection → fires webhook events.
- Rate limiting and queue management.
- Unsubscribe handling via ASM group.

### Environment variables needed
- `SENDGRID_API_KEY` — must be in Vercel env vars.
- `SENDGRID_FROM_EMAIL` — already in Vercel env.
- `SENDGRID_FROM_NAME` — already in Vercel env.

### File Targets
- [x] `lib/jobs/types.ts`
- [x] `lib/jobs/handlers/index.ts`
- [x] `lib/jobs/handlers/competitorAnnouncementDispatch.ts`

### Exit Criteria
- [ ] Handler builds correct personalizations payload and submits to SendGrid.
- [ ] Campaign and recipient statuses update correctly on success/failure.

---

## Phase 5: Mailer Dashboard (Admin Tools)
**Goal:** Dedicated admin page for composing and tracking competitor announcement emails. Replaces the initial approach of embedding in the messaging composer modal (which broke the messaging UI).

### Architecture Decision
The email campaign workflow has zero overlap with in-app messaging (no recipients selector, no drafts, no attachments, no priority). Instead of adding conditionals to the messaging composer, the email feature lives as a standalone Mailer Dashboard under Admin Tools, following the Game Platform Roster page pattern.

### Checklist
- [ ] Create Mailer Dashboard page at `app/dashboard/admin-tools/mailer/page.tsx`
  - [ ] Server component with admin auth guard
  - [ ] Fetch campaign history via `getServiceRoleSupabaseClient()` + `get_campaign_stats` RPC
  - [ ] Layout: Title → Composer Card → Campaign History Card (single scrolling page)
- [ ] Create `MailerComposer` client component at `components/dashboard/admin/mailer-composer.tsx`
  - [ ] Inline form (not a modal) with subject input + MarkdownEditor
  - [ ] Info banner: "Email will be sent to all competitors on the game platform."
  - [ ] Preview Recipients button (dry-run API call) with inline result display
  - [ ] Confirmation overlay before send
  - [ ] Success banner with "Compose Another" reset
  - [ ] `router.refresh()` after send to update campaign history table
- [ ] Add "Mailer" link to admin sidebar (`components/dashboard/admin-tools-link.tsx`)
- [ ] Move campaign section from Jobs page to Mailer Dashboard
- [ ] Remove all competitor announcement code from messaging UI:
  - [ ] `composer-modal.tsx` — remove 9 conditionals, 5 state vars, 3 handlers
  - [ ] `use-coach-composer.ts` — remove `competitor_announcement` mode
  - [ ] `coach-messaging-workspace.tsx` — remove routing
  - [ ] `inbox-action-bar.tsx` — remove button
  - [ ] `inbox-pane.tsx` — remove from onCompose type
  - [ ] `drafts.ts` — remove from mode type

### File Targets
- [ ] `app/dashboard/admin-tools/mailer/page.tsx` (new)
- [ ] `components/dashboard/admin/mailer-composer.tsx` (new)
- [ ] `components/dashboard/admin-tools-link.tsx` (edit)
- [ ] `app/dashboard/admin-tools/jobs/page.tsx` (edit — remove campaign section)
- [ ] `components/coach-messaging/composer-modal.tsx` (edit — remove competitor announcement)
- [ ] `lib/coach-messaging/use-coach-composer.ts` (edit)
- [ ] `components/coach-messaging/coach-messaging-workspace.tsx` (edit)
- [ ] `components/coach-messaging/inbox-action-bar.tsx` (edit)
- [ ] `components/coach-messaging/inbox-pane.tsx` (edit)
- [ ] `lib/coach-messaging/drafts.ts` (edit)

### Exit Criteria
- [ ] Admin can navigate to Admin Tools → Mailer and compose/send competitor announcements
- [ ] Campaign history table shows past campaigns with delivery stats
- [ ] Messaging UI has no competitor announcement code — DM/group/announcement flows unchanged

---

## Phase 6: SendGrid Webhook Feedback and Campaign Reporting
**Goal:** Close delivery loop with bounce/drop/block tracking; add minimal campaign status view.

### Webhook Extension
- [x] Extend webhook parsing for `email_type === 'competitor_announcement'`.
- [x] Match events by `campaign_id` + `competitor_id` custom args.
- [x] Update `competitor_announcement_recipients` row status:
  - `delivered` → status = 'delivered'
  - `bounce` → status = 'bounced', error = event reason
  - `dropped` → status = 'dropped', error = event reason
  - `blocked` → status = 'blocked', error = event reason
- [x] **No counter incrementing** — campaign stats are derived on-read via `get_campaign_stats()` function. This avoids lost-update issues from concurrent webhook events.
- [x] Check if all recipients have terminal status → if so, update campaign status to `sent` and set `completed_at`.

### Campaign Status View (Minimal MVP)
- [x] Add admin-only section showing past campaigns with status counts.
- [x] Can be a table on an existing admin page — does not need its own route.

### File Targets
- [x] `app/api/sendgrid/events/route.ts`
- [x] Admin page component: `components/dashboard/admin/campaign-status-table.tsx` + `app/dashboard/admin-tools/jobs/page.tsx`

### Exit Criteria
- [x] Webhook events correctly update recipient records.
- [x] Campaign summary reflects post-send delivery states.

---
# Send grid settings
SENDGRID_FROM_EMAIL=cyber@syned.org
SENDGRID_FROM_NAME="Mayors Cup Administrator"
SENDGRID_UNSUBSCRIBE_GROUP_ID=30664

## Phase 7: Testing, QA, and Rollout
**Goal:** Ship safely behind feature flag with clear rollback path.

### Checklist
- [x] Add unit tests for recipient resolver and personalizations builder.
- [x] Add unit test for markdown-to-HTML conversion.
- [ ] Add route tests for auth + validation + dry-run + response payload.
- [x] Add integration test for campaign enqueue + handler execution (mock SendGrid).
- [ ] Add UI test for composer mode toggle, confirmation dialog, and submit.
- [x] Add feature flag `NEXT_PUBLIC_COMPETITOR_ANNOUNCEMENTS_ENABLED`.
- [x] API route checks flag before processing.
- [ ] Stage rollout: dev → staging (SendGrid sandbox mode) → production.

### File Targets
- [x] `lib/messaging/competitor-announcement.test.ts` (recipient resolver)
- [x] `lib/messaging/markdown-to-html.test.ts` (markdown conversion)
- [x] `lib/jobs/handlers/competitorAnnouncementDispatch.test.ts` (job handler + SendGrid mock)
- [x] `vitest.config.ts` (test framework configuration)
- [x] Relevant flag checks in API and UI components

### Exit Criteria
- [x] All new tests passing in CI/local.
- [ ] Production launch checklist completed with rollback procedure documented.

---

## Phase 8: Coach Filter & Draft Capability
**Goal:** Enable targeted testing by filtering recipients to a specific coach's competitors, and allow saving announcements as drafts for future editing/sending.

### Coach Filter
- **Runtime query parameter only** — no schema changes. The `competitors` table already has `coach_id` on every row.
- `resolveRecipients()` accepts optional `{ coachId }` and applies `.eq('coach_id', coachId)` when provided.
- Send API route accepts optional `coachId` UUID in request body, passes to resolver.
- MailerComposer adds coach dropdown (fetched server-side from `profiles` where `role='coach'`).
- Info banner and confirmation overlay update dynamically to reflect targeted vs. all-competitors send.

### Draft Capability
- Drafts use existing `competitor_announcement_campaigns` table with `status = 'draft'`.
- Migration: expand status CHECK constraint to include `'draft'` alongside existing values.
- Draft API routes: `GET/POST /api/messaging/announcements/competitors/drafts` (list + save/upsert) and `GET/DELETE /api/messaging/announcements/competitors/drafts/[id]` (load + discard).
- MailerComposer adds: Save Draft button, Load Draft dropdown, Discard Draft button.
- Sending from a loaded draft silently deletes the draft row after successful send.
- Campaign History table excludes drafts (filtered at query level).

### File Targets
- [x] `supabase/migrations/20260209_mailer_drafts.sql`
- [x] `lib/messaging/competitor-announcement.ts` — `resolveRecipients()` with optional `coachId`
- [x] `app/api/messaging/announcements/competitors/send/route.ts` — `coachId` in schema
- [x] `app/api/messaging/announcements/competitors/drafts/route.ts` — GET + POST
- [x] `app/api/messaging/announcements/competitors/drafts/[id]/route.ts` — GET + DELETE (uses `Promise<{ id: string }>` params per Next.js 15)
- [x] `components/dashboard/admin/mailer-composer.tsx` — coach dropdown + draft UI + New/Save/Load/Discard buttons
- [x] `app/dashboard/admin-tools/mailer/page.tsx` — coaches + drafts props
- [x] `components/dashboard/admin/campaign-status-table.tsx` — draft status badge

### Implementation Notes
- Build passes, 22/22 unit tests pass
- Draft [id] route required `await params` pattern for Next.js 15 (params is a Promise)
- MailerComposer has: coach dropdown, draft loader dropdown, New/Save/Update/Discard Draft buttons, dynamic info banner + confirmation overlay text based on coach selection
- Multiple drafts can be stacked: New button clears form + unsets activeDraftId so next Save creates a fresh draft

### Bugs Found During Testing
- **Recipient status CHECK constraint missing 'failed'**: The original migration (`20260208`) set recipients CHECK to `('queued','delivered','bounced','dropped','blocked','skipped')` but the job handler (`competitorAnnouncementDispatch.ts` lines 187, 217) writes `status = 'failed'` on SendGrid errors. This causes silent CHECK constraint violations, leaving the job stuck in 'running' state. **Fix**: Added `'failed'` to recipient CHECK constraint in the `20260209_mailer_drafts.sql` migration. Must apply manually in Supabase Dashboard.
- **Stuck running job**: If SendGrid returns non-202 or network error, handler tries to set recipients to 'failed' (CHECK violation), then returns `{ status: 'failed' }` to runner, but the cascade of silent failures can leave the job in 'running'. Manual fix: `UPDATE job_queue SET status = 'failed', last_error = 'Manual reset' WHERE status = 'running' AND task_type = 'competitor_announcement_dispatch';`

### Migration SQL to Apply (20260209)
Both campaign and recipient CHECK constraints need updating. Run in Supabase Dashboard SQL Editor:
```sql
-- Campaign: add 'draft'
ALTER TABLE public.competitor_announcement_campaigns
  DROP CONSTRAINT IF EXISTS competitor_announcement_campaigns_status_check;
ALTER TABLE public.competitor_announcement_campaigns
  ADD CONSTRAINT competitor_announcement_campaigns_status_check
  CHECK (status IN ('draft', 'pending', 'sending', 'sent', 'failed'));

-- Recipients: add 'failed' (bug fix)
ALTER TABLE public.competitor_announcement_recipients
  DROP CONSTRAINT IF EXISTS competitor_announcement_recipients_status_check;
ALTER TABLE public.competitor_announcement_recipients
  ADD CONSTRAINT competitor_announcement_recipients_status_check
  CHECK (status IN ('queued', 'delivered', 'bounced', 'dropped', 'blocked', 'skipped', 'failed'));
```

---

## Operational Checklist (Post-Launch)
- [ ] Monitor send success/failure rates for first 72 hours.
- [ ] Review skipped-recipient reasons and clean unresolved onboarding emails.
- [ ] Validate webhook event ingestion volume and latency.
- [ ] Confirm no regressions in existing coach announcement flows.
- [ ] Review SendGrid unsubscribe group activity.

## Risks and Mitigations
- **Risk:** SendGrid rejects entire API call if any email has invalid syntax (no partial success).
  **Mitigation:** Validate all email addresses before building personalizations array. Skip invalid emails with recorded reason. This is the most critical validation step — one bad email tanks the whole batch.
- **Risk:** SendGrid API call fails for entire batch (rate limit, auth, server error).
  **Mitigation:** Job handler marks campaign as `failed`; admin can retry from campaign status view. Individual recipient retry is handled by SendGrid after acceptance.
- **Risk:** Inaccurate recipient targeting from inconsistent IDs.
  **Mitigation:** Centralized resolver with deterministic email precedence and explicit game-platform eligibility checks.
- **Risk:** Email mismatch vs onboarding source.
  **Mitigation:** Persist onboarding email field and backfill existing records.
- **Risk:** PII exposure in logs.
  **Mitigation:** Use safe logging patterns. No email addresses in logs — only UUIDs and counts.
- **Risk:** Missing unsubscribe mechanism.
  **Mitigation:** SendGrid ASM unsubscribe group configured before launch.

## Dependencies
- SendGrid v3 Mail Send API (direct call from job handler)
- SendGrid unsubscribe group (created in dashboard)
- Existing job queue framework: `lib/jobs/*`
- Existing admin composer flow: `components/coach-messaging/*`
- Existing SendGrid webhook endpoint: `app/api/sendgrid/events/route.ts`
- Existing client-side markdown: `react-markdown` + `remark-gfm` + `remark-breaks` (already installed)
- New dependency: `marked` (server-side markdown-to-HTML for email body conversion)

## Definition of Done
- [ ] End-to-end competitor announcement email flow available to admins behind feature flag.
- [ ] SendGrid personalizations used for batch delivery (no per-recipient edge function calls).
- [ ] Campaign and recipient status auditable in database.
- [ ] Delivery feedback loop wired via SendGrid webhook.
- [ ] Confirmation UX with dry-run preview before bulk send.
- [ ] SendGrid unsubscribe group configured.
- [ ] Test coverage added for API, worker, and composer integration.
- [ ] Rollout and rollback playbook documented and executed in staging.
