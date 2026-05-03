# Email + SMS Notification Coding Specification

> **Status (2026-05-03): SHIPPED — spec amended to match current names.** The data-model, RPCs, Edge Functions, and job handler described below are live. The original spec proposed renaming the SMS column and the processor handler; **that rename was not executed and is no longer planned**, so this doc has been amended to reflect the actual current names:
>
> - The profile column is **`sms_notifications_enabled`** (no rename to `sms_alerts_enabled`).
> - The job handler lives at **`lib/jobs/handlers/smsDigestProcessor.ts`**, job-type identifier **`sms_digest_processor`** (no rename to `unread_alert_processor` / `unreadAlertProcessor.ts`).
> - `last_unread_alert_at` / `last_unread_alert_count` exist; refresh path is the **`mark_unread_alert_sent`** RPC (migration `20251109120000`).
>
> For current operational behavior consult `sms-coach-notification-spec.md` and `sms-admin-notification-spec.md`.

Assumptions:
- SendGrid is the existing transactional email provider (API key stored in Supabase
  secrets and Next.js environment variables).
- SMS continues to run through the existing Edge Function
  `send-sms-notification` (Twilio by default, AWS SNS optional later).
- Notification content is the simple alert:
  `Hi {{first_name}}, you have {{n}} unread messages in your Coach Dashboard.`

## 1. Data Model

### 1.1 `profiles` table

| Column | Type | Default | Notes |
| --- | --- | --- | --- |
| `email_alerts_enabled` | boolean | `true` | Every coach receives email alerts unless they explicitly switch them off. **(Shipped.)** |
| `sms_notifications_enabled` | boolean | `false` | Coach opts in to SMS alerts. **(Shipped — kept under the original column name; no rename was executed.)** |
| `mobile_number` | text | `null` | Already exists. Require valid value before enabling SMS. |
| `last_unread_alert_at` | timestamptz | `null` | Updated whenever any channel successfully sends. **(Shipped.)** |
| `last_unread_alert_count` | integer | `null` | Stores the unread count used for the last alert to power throttling. **(Shipped.)** |

Migration steps:
1. Add `email_alerts_enabled`, `email_alert_address`, `last_unread_alert_at`, `last_unread_alert_count` to `profiles`. **(Done — `20251109120000_add_email_alert_preferences.sql`.)** `sms_notifications_enabled` was already present; no rename.
2. Backfill `email_alerts_enabled = true` for all existing coaches. **(Done.)**

### 1.2 `alert_log` table

```sql
CREATE TABLE public.alert_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email','sms')),
  unread_count integer NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  error_text text
);

CREATE INDEX idx_alert_log_coach_channel ON public.alert_log (coach_id, channel, sent_at DESC);
ALTER TABLE public.alert_log ENABLE ROW LEVEL SECURITY;

-- Coaches can see their own history
CREATE POLICY alert_log_select_self ON public.alert_log
  FOR SELECT USING (coach_id = auth.uid());

-- Only service role inserts
CREATE POLICY alert_log_insert_service ON public.alert_log
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
```

This replaces the `message_digest_log` + `log_sms_digest_audit` combo. The old table can
remain temporarily to avoid losing history, but new code should use `alert_log`.

## 2. Supabase Functions / RPCs

### 2.1 `fetch_unread_alert_candidates`

```sql
CREATE OR REPLACE FUNCTION fetch_unread_alert_candidates(p_window_minutes integer DEFAULT 1440)
RETURNS TABLE (
  coach_id uuid,
  email text,
  full_name text,
  first_name text,
  mobile_number text,
  unread_count integer,
  email_alerts_enabled boolean,
  sms_notifications_enabled boolean,
  last_unread_alert_at timestamptz,
  last_unread_alert_count integer
) AS $$
  WITH unread AS (
    SELECT p.id AS coach_id,
           p.email,
           p.full_name,
           p.first_name,
           p.mobile_number,
           coalesce(count_unread_by_receipts(p.id), count_unread_messages(p.id)) AS unread_count,
           p.email_alerts_enabled,
           p.sms_notifications_enabled,
           p.last_unread_alert_at,
           p.last_unread_alert_count
    FROM profiles p
    WHERE p.role = 'coach'
  )
  SELECT *
  FROM unread
  WHERE unread_count > 0
    AND (
      last_unread_alert_at IS NULL
      OR last_unread_alert_count IS NULL
      OR unread_count > last_unread_alert_count
      OR last_unread_alert_at < now() - make_interval(mins => p_window_minutes)
    );
$$ LANGUAGE sql STABLE;
```

This RPC encapsulates the throttling rules so the job handler only iterates over rows
that need alerts.

### 2.2 Helper function to update last alert metadata

```sql
CREATE OR REPLACE FUNCTION mark_unread_alert_sent(
  p_coach_id uuid,
  p_unread_count integer
) RETURNS void AS $$
  UPDATE profiles
  SET last_unread_alert_at = now(),
      last_unread_alert_count = p_unread_count
  WHERE id = p_coach_id;
$$ LANGUAGE sql VOLATILE;
```

## 3. Edge Functions / Services

### 3.1 `send-email-alert`

Create a new Supabase Edge Function at `supabase/functions/send-email-alert/index.ts`.

Responsibilities:
1. Validate the Supabase service-role bearer (same pattern as existing SMS function).
2. Accept payload `{ email: string, fullName?: string, unreadCount: number }`.
3. Build the template strings described in `README.md`.
4. Call SendGrid using the existing API key (store in Supabase secret
   `SENDGRID_API_KEY`). Use the “dynamic template” if already available or send a plain
   text email via `https://api.sendgrid.com/v3/mail/send`.
5. Return `{ success: boolean, messageId?: string, error?: string }`.
6. Log without PII (only coach ID + message ID).

### 3.2 Update `send-sms-notification`

Minimal changes:
- Replace the caller-provided message body with the canonical alert template so the body
  always matches the email.
- Keep existing provider abstraction (Twilio/AWS). No new secrets needed.

### 3.3 Processor job

File: `lib/jobs/handlers/smsDigestProcessor.ts` (job-type identifier `sms_digest_processor`).

The handler is registered in `lib/jobs/types.ts` and surfaced in admin UI under its original name. The job-flow contract:

```ts
const candidates = await supabase.rpc('fetch_unread_alert_candidates', { p_window_minutes: payload.windowMinutes ?? 1440 });
for (const coach of candidates) {
  if (coach.email_alerts_enabled) await callSendEmailAlert(...);
  if (coach.sms_notifications_enabled) await callSendSmsNotification(...);
  await supabase.rpc('mark_unread_alert_sent', { p_coach_id: coach.id, p_unread_count: coach.unread_count });
  await supabase.from('alert_log').insert({...});
}
```

The handler also supports a `dryRun` flag that logs the payload instead of sending.

### 3.4 Instrumentation service

Admin instant alerts should reuse the same edge functions as the daily notifications; the
legacy Realtime worker (`lib/sms/instant-sms-service.ts`) was removed in favor of the
`admin_alert_dispatch` job that runs every few minutes.
If desired, add a guard so this service only runs in production builds where a service
role key is available.

## 4. UI / UX Updates

File: `app/dashboard/settings/page.tsx`
1. Replace the copy under the SMS toggle with:
   > “Receive a daily text that tells you how many unread messages you have. We will send
   > the same reminder by email automatically.”
2. Add a checkbox for email alerts to allow opting out (default checked and disabled if
   policy requires email).
3. Ensure enabling SMS validates `mobile_number` and sets `sms_notifications_enabled = true`.
4. Remove any references to digest time/timezone. These columns will eventually be
   dropped.

## 5. Environment Variables / Secrets

| Name | Location | Notes |
| --- | --- | --- |
| `SENDGRID_API_KEY` | Supabase Edge Function secrets + `.env.local` | Already present for other email flows; reuse. |
| `SENDGRID_FROM_EMAIL` | Environment | From address for alerts (e.g., `coach-notifications@example.edu`). |
| `SENDGRID_TEMPLATE_ID` (optional) | Environment | If using a stored template, pass the ID; otherwise omit. |
| `SMS_PROVIDER` | Supabase secrets | Existing; keep as `twilio` until AWS is ready. |
| `SUPABASE_SECRET_KEY` | Server env | Phase A typed-config replacement for `SUPABASE_SERVICE_ROLE_KEY`. The legacy var is still honored as a fallback by `lib/config`. |

## 6. Testing Plan

1. **Unit / Integration**
   - Add tests around the alert RPC using `supabase/tests` or SQL assertions.
   - Mock SendGrid + SMS fetch calls in `lib/jobs/handlers/smsDigestProcessor.test.ts`
     (Vitest) to verify branching logic.
2. **Manual**
   - Enable email alerts and confirm SendGrid logs show the outgoing message.
   - Enable SMS for a test coach and verify Twilio/AWS receives the new body.
   - Toggle `dryRun` and ensure no external calls occur.
3. **Backfill**
   - Run a one-time script to initialize `last_unread_alert_*` for each coach so the job
     does not fire for everyone immediately after deployment.

## 7. Deployment Checklist

1. Apply migrations (`supabase db push`).
2. Deploy Edge Functions (`send-email-alert`, updated `send-sms-notification`).
3. Redeploy Next.js so `register()` boots any updated instrumentation and the
   `smsDigestProcessor` handler is available.
4. Confirm cron/job configuration points at the `sms_digest_processor` job type.
5. Monitor `alert_log` and SendGrid/Twilio dashboards for the first 48 hours.

Following this specification keeps the implementation aligned with the simplified
notification strategy documented in `README.md` while leveraging the existing SendGrid
integration for the email-first rollout.

---

**Last verified:** 2026-05-03 against commit `e5b937b9`.
**Notes:** Spec amended (2026-05-03) — original `sms_alerts_enabled` column rename and `unreadAlertProcessor` handler rename are **dropped** and no longer planned. Spec now describes the as-built names (`sms_notifications_enabled`, `smsDigestProcessor` / `sms_digest_processor`). Data model + RPCs + Edge Functions + handler are all live. `sms-coach-notification-spec.md` and `sms-admin-notification-spec.md` remain the canonical operational descriptions; this file is the implementation spec it grew out of.
