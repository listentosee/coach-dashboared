# Admin Notification Specification

## Data Model
- **admin_alert_queue**
  - `recipient_id` (auth.users.id), `message_id` (messages.id), `created_at`.
  - Unique index on `(recipient_id, message_id)` prevents duplicate enqueues.
  - RLS enabled; policy `admin_alert_queue_service_rw` allows service-role only.
- **messages**: standard message rows; enqueue uses `conversation_members` membership to find admins.
- **profiles**: `email`, `email_alert_address`, name fields. Used for targeting emails.
- **alert_log** (shared): optional downstream logging if needed.

## Enqueue Flow (per-message)
- Route: `POST /api/messaging/conversations/[id]/messages`
  - After inserting a message, uses **service-role** client to:
    - Select `conversation_members` for the conversation (excluding sender).
    - Filter members with `profiles.role = 'admin'`.
    - Upsert rows into `admin_alert_queue` for each admin recipient and the new `message_id`.
  - Message send is not blocked if enqueue fails (errors logged).

## Job/Processor
- Job: `admin_alert_dispatch` (registered in job handlers)
  - Reads all rows from `admin_alert_queue`.
  - Groups by `recipient_id`, counts messages.
  - Fetches recipients from `profiles` with `email_alert_address`, `email`, `full_name`, `first_name`.
  - Target email: `to = email_alert_address || email` (override honored).
  - Sends one email per admin via `send-email-alert` Edge Function with `templateData.messages = pendingMessages.length`.
  - On success, deletes processed queue rows for that recipient/message_ids to avoid resends.
  - Summary output includes per-recipient results.
- Scheduling: create a recurring job (`admin_alert_dispatch`) via Admin Tools → Job Queue; recommend every 5 minutes.

## Edge Functions
- **send-email-alert**: same function used by coach flow; called with service-role bearer.
- SMS is disabled for admins in this flow (`allowSms` unused); emails only.

## Behavior Summary
- Exactly one email per admin per batch of new messages (deduped by queue uniqueness).
- Admin email override is honored; falls back to base email if no override.
- No unread-count dependence; driven by queued message events.

## Deployment/Config
- Ensure migration `20251120180000_admin_alert_queue.sql` applied (table, index, RLS).
- Admin alert job must be scheduled in the job queue.
- Service-role env vars required for enqueue (message route) and job handler: `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`.
- Edge function `send-email-alert` must be deployed and reachable by service-role.

## Flow Diagram (Messaging + Job Queue)
```
POST /conversations/{id}/messages
          ↓ insert
      messages
          ↓ service role
  conversation_members
          ↓ admins only
  admin_alert_queue (recipient_id, message_id)
          ↓ dedup by unique idx

job_queue (admin_alert_dispatch)
          ↓ every run
   read queue rows
          ↓ group by recipient_id, count messages
   fetch profiles (email_alert_address || email)
          ↓ one email per admin (send-email-alert)
   delete processed queue rows
          ↓
      job success
```
