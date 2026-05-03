# Features

Live-feature specifications.

## Files

| File | Status | Last verified | Summary |
|---|---|---|---|
| [analytics-implementation.md](./analytics-implementation.md) | Verified | 2026-05-03 (`e5b937b9`) | Original feature checklist; admin analytics dashboard at `app/dashboard/admin-tools/analytics/page.tsx` is shipped and exceeds the checklist. |
| [sms-admin-notification-spec.md](./sms-admin-notification-spec.md) | Verified | 2026-05-03 (`e5b937b9`) | Admin SMS/email alerts via `admin_alert_queue` + `admin_alert_dispatch` job + `send-email-alert` Edge Function. SMS disabled in this flow. |
| [sms-coach-notification-spec.md](./sms-coach-notification-spec.md) | Verified | 2026-05-03 (`e5b937b9`) | Coach unread-message alerts via `fetch_unread_alert_candidates` RPC + `/api/internal/notifications/unread` + `sms_digest_processor` job. |
| [email-sms-coding-spec.md](./email-sms-coding-spec.md) | Partially shipped | 2026-05-03 (`e5b937b9`) | Original implementation plan. Data-model and Edge Functions shipped; proposed `sms_alerts_enabled` rename and `unreadAlertProcessor` rename did NOT ship. |

## Moved out of SOT (Phase 2)

| File | New location | Reason |
|---|---|---|
| `assistant-coach-delegation.md` | [`docs/features/historical-assistant-coach-delegation.md`](../../features/historical-assistant-coach-delegation.md) | Parked design (1/35 coaches requesting). Zero references in code as of `e5b937b9`. Followed precedent set by `docs/game-platform/historical-nice-full-design.md`. |
