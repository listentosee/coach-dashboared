Failed to generate profile update link on dashboard for competitor.
	- Generation works when adding a competitor.  

# Smoke Tests

[pass] Sign in/out: Log in as admin and as a regular coach. Ensure sign out returns to login.
[pass] Middleware gate: Hit any /dashboard/* route while signed out → redirects to /auth/login.
[pass] Non‑admin admin routes: As a coach, navigate to /dashboard/admin-tools → redirects to /dashboard.

# Admin Tools
[pass] Submenu: Expand “Admin Tools” in the sidebar → see “General” and “Analytics”. Links work.

## Analytics page:
[pass] Loads without warnings in console.
[pass] Coach filter: Select a coach, click Apply → totals and status breakdown change plausibly; clearing returns to “All Coaches”.
[pass] Releases pipeline: Not Started + Sent + Complete ≈ Competitor total (allow small differences if multiple agreements exist).

## Admin Assist: Reset password for a coach → receive temp password; no errors.
[pass] Forced Password Reset

## End‑to‑end: With a coach temp password:
[pass] Log in → redirected to /auth/force-reset.
[pass] Enter new password (not the temp), submit → “Password updated. You can proceed…”.
[pass] Click “Proceed to Dashboard” → lands on /dashboard and can navigate freely.
[pass] Try a second visit to /auth/force-reset → should not redirect away from dashboard (flag cleared).

# Dashboard (Coach)
[pass] Division counts: Toggle “Show Inactive Competitors” on/off → “All (N)” and division counts change and add up. Filters work.
[pass] Status Breakdown: Pending/Profile/Compliance/Complete counts look consistent with data.
[pass] Teams: Teams count tile shows correct total; link opens Teams; assign/remove a member works.
[pass] Disable competitor action icon
[pass] Generate profile update link
[pass] Add competitor and generate profile update link

# Competitors/Teams APIs (getUser)
[pass] Competitors: Page loads full list for admin; as coach, shows only own competitors. No 401s.
[pass] Teams: Page and API-backed controls work (list teams, add/remove member). No 401s.
[pass] Upload team image
[pass] Check a competitor’s team assignment reflects after refresh.

# Messaging Unread (getUser)
[pass] Sidebar unread badge: Updates after receiving/sending a message (you may need two accounts). No 401s.
[pass] Hitting /api/messaging/unread/count while logged out (in a private tab) returns 401.

# Admin Analytics API

[pass] /api/admin/analytics and /api/admin/analytics?coach_id=<coachId> in the browser (while logged in as admin):
[pass] Returns JSON with coaches, totals, statusCounts, releases. No 401s/403s.