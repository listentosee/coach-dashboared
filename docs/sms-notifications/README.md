# Messaging Notifications (Email + SMS)

This folder now tracks one source of truth for the notification strategy used by the
Coach Dashboard. The previous digest-specific docs referenced configurable time windows,
preview text, and AWS-only setup steps that no longer reflect the codebase or roadmap.
This document explains the current implementation, highlights the gaps, and captures the
email-first + opt-in SMS plan that replaces the digest approach.

## 1. Current State Snapshot

- **Unread counter API** – `GET /api/messaging/unread/count` wraps the Supabase RPCs
  `count_unread_by_receipts` → `count_unread_messages` to return the unread total for the
  authenticated coach. The sidebar badge in `app/dashboard/layout.tsx` polls this
  endpoint and subscribes to realtime triggers for freshness.
- **Notification trigger** – A Vercel cron hits `/api/jobs/run` every 5 minutes. The
  job queue claims any due `sms_digest_processor` jobs, whose handler now calls the
  internal route `/api/internal/notifications/unread`. That route collects coaches via
  the `fetch_unread_alert_candidates` RPC and dispatches email + SMS alerts.
- **Email delivery** – `send-email-alert` (Supabase Edge Function) sends templated
  transactional mail through SendGrid using secrets stored in the Edge vault.
- **SMS delivery** – `send-sms-notification` remains the single gateway for Twilio/AWS
  SNS. Both the internal route and the admin instant-SMS service reuse this function.
- **Logging** – `alert_log` records every alert attempt (`email` or `sms`). Coaches
  inherit the last-alert metadata (`last_unread_alert_at`/`_count`) for throttling.
- **UI toggles** – `/dashboard/settings` includes an “Alert Notifications” card that
  lets coaches opt into daily email reminders (with custom address) and optional SMS.
- **Admin instant SMS** – `lib/sms/instant-sms-service.ts` runs from
  `instrumentation.ts`, subscribes to Supabase Realtime, and fires SMS alerts for admins
  with `instant_sms_enabled = true`.

### Why the old digest docs were removed

1. **Digest vs. Alert** – The previous hourly digest/preview flow no longer exists; we
   only send a single unread-count alert.
2. **Channel strategy shift** – Faculty email is now the default channel, with SMS as a
   lightweight opt-in copy. All AWS End User Messaging setup instructions became noise.
3. **Simplified architecture** – Message-level dedupe tables (`message_digest_log`) and
   cron trigger functions are gone, replaced by `alert_log` and profile metadata.
4. **Documentation sprawl** – Maintaining nine digest-specific guides slowed us down, so
   everything now lives in this README + the coding spec.

## 2. Target Architecture

```
┌─────────────────────┐
│   Daily Cron Job    │  ← pg_cron / Supabase Job / Vercel Cron
└─────────┬───────────┘
          │
          ▼
┌────────────────────────────────────────────────────────────────────┐
│ fetch_unread_alert_candidates (SQL/RPC)                            │
│ • Returns coach_id, unread_count, email, phone, alert preferences  │
│ • Applies cooldown rules (unchanged count within last 24h)         │
└─────────┬──────────────────────────────────────────────────────────┘
          │
          ├──────────────┐
          │              │
          ▼              ▼
┌───────────────────┐  ┌────────────────────────┐
│ send-email-alert  │  │ send-sms-alert         │
│ • SendGrid API    │  │ • Existing SMS gateway │
│ • Subject:        │  │ • Same message body    │
│   “Unread messages”│ │ • Optional per coach   │
└─────────┬─────────┘  └──────────────┬────────┘
          │                           │
          ▼                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ alert_log (coach_id, channel, unread_count, sent_at, error)     │
│ • Replaces message_digest_log                                   │
│ • Powers monitoring + throttling                                │
└─────────────────────────────────────────────────────────────────┘
```

**Alert copy (email + SMS)**

```
Hi {{first_name || 'Coach'}}, you have {{unread_count}} unread messages in your
Coach Dashboard. Please log in to read and respond.
```

We intentionally omit message previews, student names, and any other PII so the alert can
travel via email, SMS, Slack, or any future channel without privacy concerns.

## 3. Implementation Plan

### Phase 1 – Email baseline (SendGrid)

1. **Schema additions**
   - `profiles.email_alerts_enabled BOOLEAN DEFAULT true`
   - `profiles.sms_alerts_enabled BOOLEAN DEFAULT false`
   - `profiles.last_unread_alert_at TIMESTAMPTZ`
   - `profiles.last_unread_alert_count INTEGER`
   - Optional new `alert_log` table with `{ id, coach_id, channel, unread_count, sent_at,
     error_text }`
2. **RPC** – `fetch_unread_alert_candidates(p_window_minutes integer)` uses the unread
   count functions plus the last-alert metadata to find coaches who need a notification.
3. **Edge Function** – `send-email-alert` uses the existing SendGrid API key already
   stored in project settings to deliver a transactional email with the copy above.
4. **Job rename** – Update `sms_digest_processor` → `unread_alert_processor` (and the
   cron entry) so the job:
   - Calls the RPC.
   - For each coach with `email_alerts_enabled`, call `send-email-alert`.
   - For coaches with `sms_alerts_enabled`, call the existing
     `send-sms-notification` function with the same body.
   - Records each attempt in `alert_log` and updates `last_unread_alert_*`.

At the end of this phase, **every coach receives an email reminder** whenever unread > 0
and either (a) the count increased since the previous alert or (b) 24 hours have passed
since the last alert.

### Phase 2 – SMS opt-in improvements

1. Update `/dashboard/settings` copy to explain that SMS mirrors the daily email and is
   optional. Store the toggle in `profiles.sms_alerts_enabled`.
2. Support manual verification for personal phone numbers if we run Twilio/AWS in
   sandbox mode, or onboard the Google Voice → Twilio sender workflow.
3. Ensure the Supabase secret `SMS_PROVIDER` is set (Twilio by default) and continue to
   route through `send-sms-notification`. Only the message body changes.

### Phase 3 – Optional enhancements

- Add Slack/Microsoft Teams webhook delivery.
- Provide admin-facing analytics using `alert_log`.
- Allow institutions to adjust cadence (daily vs weekly) via configuration.

## 4. Operational Considerations

- **Scheduling** – A single cron job is sufficient. 10:00 ET works well so the email
  lands before most faculty office hours. The job should be idempotent: rerunning the
  same day should not send a duplicate alert unless the unread count changed.
- **Dry runs** – The job handler already accepts `dryRun` in `lib/jobs/handlers/
  smsDigestProcessor.ts`. Preserve that behavior when renaming the job so we can test
  without hitting SendGrid/Twilio.
- **Logging** – `alert_log` is the single source of truth. Each alert writes one row per
  channel (email/SMS) along with any provider error response.
- **Compliance** – Because the alert only contains counts, there is no FERPA-sensitive
  content in transit. Phone numbers and email addresses remain behind RLS policies, and
  logs contain only IDs and counts.

## 5. Next Steps

1. Apply the schema + RPC changes outlined above.
2. Implement the SendGrid-based email alert function.
3. Update the cron/worker to call both channels and record results in `alert_log`.
4. Refresh `/dashboard/settings` copy + toggles to reflect the new behavior.
5. Follow the coding checklist in `email-sms-coding-spec.md` to keep the delivery work
   consistent across environments.

Questions or implementation details? See the coding spec in this directory or reach out
in `#coach-platform-notifications`.
