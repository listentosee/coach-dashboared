# Coach Notification Specification

## Data Model
- **profiles**: columns `email`, `mobile_number`, `email_alerts_enabled`, `email_alert_address`, `sms_notifications_enabled`, `last_unread_alert_at`, `last_unread_alert_count`.
- **alert_log**: records each alert attempt (`coach_id`, `channel`, `unread_count`, `sent_at`, `error_text`). RLS enabled.
- **RPC** `public.fetch_unread_alert_candidates(p_window_minutes int DEFAULT 1440, p_coach_id uuid DEFAULT NULL, p_force boolean DEFAULT false, p_roles text[] DEFAULT ARRAY['coach'])`
  - Returns unread candidates with `email_alert_address` and `sms_notifications_enabled`.
  - Filters by unread count changes/cooldown; `p_roles` limits roles (use `NULL` or include `coach`).

## Edge Functions
- **send-email-alert**: Supabase Edge Function; sends via SendGrid using service-role auth. Input `{ to, templateData, coachId }`. Honors `to` provided by caller.
- **send-sms-notification**: Supabase Edge Function; Twilio/AWS via service-role auth. Skips send when `SMS_PROVIDER=disabled`.

## Server Code & Flow
- **Internal API** `/api/internal/notifications/unread`
  - Auth via `x-internal-automation-secret`.
  - Calls `fetch_unread_alert_candidates` with provided `windowMinutes`, `coachId`, `force`, `roles`, `allowSms`.
  - For each candidate:
    - Email target: `alertEmail = candidate.email_alert_address || candidate.email`.
    - Sends email via `send-email-alert`.
    - Optional SMS when `allowSms && sms_notifications_enabled && mobile_number`.
    - Writes `alert_log` rows per channel; updates `last_unread_alert_*` on success.
- **Job handler** `sms_digest_processor` (registered in job handlers)
  - Invokes the internal route with payload parameters (windowMinutes, force, coachId, roles).
  - Driven by the job queue (manual or recurring).
- **Settings UI** `/dashboard/settings`
  - Stores `email_alert_address` override and `email_alerts_enabled`.
  - Toggle writes to `profiles` via client Supabase calls.

## Deployment/Config
- Requires service-role env: `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`.
- Edge functions deploy separately (`send-email-alert`, `send-sms-notification`).
- If deployment protection is enabled on Vercel, include bypass header (`x-vercel-protection-bypass`) in automation calls.

## Behavior Summary
- Coaches receive unread-count alerts (email by default; SMS optional).
- Override is honored: if `email_alert_address` is set, all coach alerts use it; otherwise base `email`.
- Cooldown/unread gating handled by `fetch_unread_alert_candidates`; `force` bypasses cooldown but still requires unread > 0.

## Flow Diagram (Messaging + Job Queue)
```
Coach settings (email_alert_address, email_alerts_enabled)
          ↓ (stores override)
      profiles
          ↓
      job_queue (sms_digest_processor)
          ↓ every run
  /api/internal/notifications/unread
          ↓
fetch_unread_alert_candidates
          ↓ candidates?
      ┌───────────────┐
      │ none          │────→ summary: 0
      │ has rows      │
      └───────────────┘
          ↓
  Send email (send-email-alert)
  Send SMS (send-sms-notification, optional)
          ↓
  alert_log + last_unread_alert_*
          ↓
      job success
```
