# Phase 2 Canary Test Plan

## Smoke

[pass] Sign in/out (admin and coach). Sign out returns to login.
[pass] Middleware gate: Visiting /dashboard/* while signed out redirects to /auth/login.

## Competitors

## As coach:
[pass] Create competitor → succeeds; profile update link appears in response; no 401.
[pass] Toggle active/inactive → update works; UI reflects state.
[pass] Regenerate profile update link → returns URL; updated expiry displays.
[pass] Update competitor (name/email/division) → saves; status recalculates if needed.

## As admin:
[pass] Competitors list shows all competitors.
[Functino does not exist] Creating competitor with coach_id set → assigns to that coach.
[Functino does not exist] Updating competitor belonging to another coach → succeeds (admin override).

[pass] Check “Maintenance: update-statuses” endpoint (button or manual POST) runs without 401.
Teams

##As coach:
[pass] Create team → team shows under own account; no 401.
[pass] Add competitor to team; (drag drop, fail in competitor list button) (500 error in browser and terminal console)
[pass] remove competitor from team. (and in competitor list button)
[pass] Delete team → success (only own teams).
[pass] Upload team image

## As admin:
[pass] Delete another coach’s team → allowed.
[pass] Members add/remove across coaches → succeeds (admin override).

## Users APIs
[pass] /api/users/admins, /api/users/coaches, /api/users/directory:
[pass] While signed in: return results.(data, data, 500 error FAIL) if logged in as a user this should return a 401 for any data that is not the logged in user. Currently any user can get a full list of coaches and admins.
[pass] While signed out: return 401.
[pass] Confirm logs no getSession warnings.

##Messaging

[pass] Conversations page loads; conversations endpoint returns data; no 401.

DM endpoint:
[pass] POST /api/messaging/conversations/dm with a valid userId → returns conversationId. Composition form loads but does not show user list. 

Group endpoint:
[pass] POST /api/messaging/conversations/group with userIds + title → returns conversationId; creator included. Composition form loads but does not show user list. 

Messages:
[pass] GET /api/messaging/conversations/[id]/messages → returns messages.
[] POST .../messages with body and parentMessageId → creates a message. Unable to test because of above.

Announcements send endpoint:
[pass] POST /api/messaging/announcements/send → returns ok; check for 401 if logged out.
[pass] POST /api/messaging/announcements/send; logged in as admin produces 500 error
NOTE: Private response should only be visible to the Announcement author and the user sending the private message. No one else should see private messages they did not send.

Read/mute:
[pass] POST /api/messaging/conversations/[id]/read → returns ok; unread badge decreases.
[pass] POST /api/messaging/conversations/[id]/mute → only admin should be allowed; returns ok or 403 as appropriate. Function is not available.

Unread count:
[pass] /api/messaging/unread/count returns count when signed in; returns 401 when signed out.


## Admin Analytics

[pass] /api/admin/analytics and with ?coach_id=... → returns JSON with totals, breakdown, releases; no 401.
[pass] GUI analytics page works (already tested in Phase 1 canary).

Logs and warnings
[pass] Confirm the Supabase warning about using getSession on server no longer appears for the hardened routes above.
[pass] No new auth errors in server logs.