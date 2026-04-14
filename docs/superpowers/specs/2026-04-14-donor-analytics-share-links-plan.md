# Donor Analytics Share Links Plan

## Purpose

Provide a simple way to share a donor-safe analytics view with expirable and optionally use-limited magic links.

This is not a public admin login bypass. It is a separate read-only shared route that mirrors the admin analytics story as closely as practical while excluding admin-only controls and the coach table.

## Scope

- create a share link from `Admin Tools -> Analytics`
- store the link in a small database table
- open a donor-safe report at `/shared/analytics/[token]`
- support optional expiration
- support optional max-use limits
- track basic link usage
- generate the public URL on the current running domain
- allow one-click copy from the admin analytics page

## Out of Scope

- no admin authentication bypass
- no editing from the shared page
- no student names
- no coach emails
- no coach summary table
- no admin filters
- no share-management controls on the public page

## Data Model

Use one small table:

- `analytics_share_links`

Columns:

- `id`
- `token`
- `report_type`
- `expires_at`
- `max_uses`
- `use_count`
- `last_used_at`
- `revoked_at`
- `created_by`
- `created_at`

Migration:

- `supabase/migrations/20260414063115_add_analytics_share_links.sql`

## Route Plan

Admin route:

- `POST /api/admin/analytics/share`

Public route:

- `GET /shared/analytics/[token]`

## Behavior

When an admin creates a link:

- generate an opaque token
- save expiration and max-use settings
- return the public share URL using the current request domain
- allow the admin to copy the URL directly from the share panel

When a donor opens a link:

- find the token
- reject if revoked
- reject if expired
- reject if `max_uses` has been reached
- increment `use_count`
- set `last_used_at`
- render the donor-safe analytics page

## Shared Report Content

The shared report should include the same core sections shown in `Admin Tools -> Analytics`, except for the coach table and admin controls.

Included sections:

- top stat tiles
- school distribution map
- competitor status distribution
- release / agreement pipeline
- division mix
- demographic charts
- game platform challenge and activity analytics
- Flash CTF participation
- challenge topic clustering

Excluded sections:

- coach summary table
- coach filter controls
- share creation controls
- direct contact information
- student-level personally identifying data

## Admin UI

Keep the admin UI small:

- one share panel on the analytics page
- input for expiration in days
- input for max uses
- button to create the share link
- returned URL ready to copy
- explicit `Copy Link` button

## Implementation References

- `app/api/admin/analytics/share/route.ts`
- `app/shared/analytics/[token]/page.tsx`
- `components/dashboard/admin/analytics-share-panel.tsx`
- `lib/analytics/share-links.ts`
- `lib/analytics/shared-report.ts`

## Status

Implemented current state:

- share-link creation route exists
- donor-safe shared page exists
- analytics admin page includes the share panel
- migration has been applied
- public links use the current running domain
- the share panel has a working clipboard copy action
- the shared page now mirrors the admin analytics page content much more closely
- the shared page still excludes the coach table and admin-only controls

## Recommendation

Keep this feature exactly this small:

- one table
- one admin action
- one public read-only route
- one donor-safe report view

Anything more complicated should wait for an actual donor or sponsor requirement.
