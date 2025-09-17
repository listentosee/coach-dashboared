# Next.js Upgrade – Canary Test Checklist

Goal: Verify core coach/admin flows on Next 15 before pushing to production. Use this list to track that nothing regressed and that new runtime requirements (cookies() pattern, RSC, etc.) are satisfied.

## Build & Runtime
- [x] `npm run build` completes without errors or font fetches
- [x] Devtools disabled: no RSC “SegmentViewNode” errors at runtime
- [x] No `cookies()` warnings in terminal (Next 15 dynamic API pattern)
- [x] `npm run dev` starts; app loads `/dashboard` without error

## Auth & Session
- [x] Coach: login/logout works; session persists across refresh
- [x] Admin: login/logout works; no reload loops
- [ ] Admin context switch (select coach) works; clearing context works
- [x] SingleSessionGuard OFF by default (env not set) – no forced reloads
- [x] SingleSessionGuard ON (`NEXT_PUBLIC_SINGLE_SESSION_GUARD=1`) – opening a second tab and logging in as a different user reloads the other tab to unify session; logging in as admin reloads other tabs to match admin session

## Competitors – Dashboard List
- [x] Progressive loading: first 40 rows, +20 on panel scroll trigger (only for admin)
- [x] Division filter + “Show inactive” work together
- [x] Actions: Edit, Regenerate link, Register (placeholder), Enable/Disable
- [partial] Paper airplane “Send” icon only when eligible (matches Release Mgmt): 
NOTE: List does not seem to refresh on webhook notification of completion
  - [x] Status is profile/compliance/complete
  - [x] No legacy signed date (media/participation)
  - [x] No existing agreement row
  - [x] Valid recipient email (adult: personal or school; minor: parent)

## Release Management
- [x] Digital send (email) – creates agreement row; status shows Sent
- [x] Print pre-filled – creates Print Ready; PDF becomes available; sending does NOT mark completed; webhook “completed” for print is ignored
- [x] Upload Signed – sets `completed_manual`, stamps date field, competitor status advances
- [x] Download PDF for completed agreements works
- [x] Header notice “ATTENTION: … profile or higher” visible with pill
- [x] Manual send instructions show the multi-step guidance

## Teams
- [x] Team list loads; available competitors filtered to “not on any team”
- [x] Create team, delete empty team
- [x] Drag/drop member into team – immediate optimistic add; server success keeps it; failure reverts
- [x] Remove member – immediate optimistic remove
- [x] Upload team image works (and visible after upload)

## Bulk Import
- [x] CSV and XLSX both import; template downloads OK
- [x] School email required for ALL participants (client + server)
- [x] Parent email required if minor AND parent name provided (client + server)
- [x] Level of Technology values: PC, MAC, Chrome book, Linux, Other
- [x] Case-insensitive enumeration parsing; out-of-list flagged as errors
- [x] Years competing accepts 0 and validates 0–20
- [partial] Is Adult must accept Y/N, y/n, True/False (case insensitive)

## Competitor Profile Update (token)
- [x] Form layout: Row1 Ethnicity/Race; Row2 Gender/Tech; Row3 Years/Personal Email (+ Send)
- [x] Adult: personal email send uses the live field value (no save required); confirmation shows the actual email address
- [x] Minor: parent name/email fields required; no “send participation” shown
- [x] Token expiration handled (expired → error)
- [x] Status calculation respects years_competing = 0 (allowed)

## Profile/Link Generation
- [x] Create competitor: profile link uses current request origin (prod-safe base URL)
- [x] Regenerate link returns valid URL; no 401/403
- [x] Email templates end after “Thank you,”

## Admin pages
- [x] Admin Tools pages load without `cookies()` warnings
- [x] `/api/users/coaches` works (role required)
- [x] `/api/admin/context` GET/POST set/clear `admin_coach_id` cookie without warnings

## Messaging
- [partial] Unread count endpoint works; no `cookies()` warnings 
NOTE: Unread and count are inconsistant and not accurate
- [partial] Basic DM create + unread badge update (sanity check)
NOTE: Unread and count are inconsistant and not accurate

## Logs & Errors – Must have NONE
- [x] No `Error: Route "…" used cookies() … should be awaited` in terminal
- [x] No RSC manifest/DevTools errors
- [x] No build-time Google Fonts fetch errors (Inter removed)

## Optional (Admin Scale Follow‑up)
- [x] Add `/api/competitors/paged` endpoint (offset/limit) for admin 7k scale
- [x] Switch admin list to incremental server paging (keep coach on client slice)
- [x] (Optional) Add virtualization for smoother scrolling when many rows are in DOM

## Commands
- [x] Local prod build: `npm run build`
- [x] Local dev: `npm run dev`
- [x] Preview build (Vercel) after PR merges

Notes
- SingleSessionGuard is feature-gated by `NEXT_PUBLIC_SINGLE_SESSION_GUARD`. Leave unset during routine dev. Enable for targeted session-unification testing.

