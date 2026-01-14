# Game Onboarding Bypass Plan

## Decisions (recorded for implementation)
- [x] Use new competitor status key `in_the_game_not_compliant` (label: "In The Game NC").
- [x] Auto-onboard competitors when they reach `profile` status.
- [x] Disable manual Game Platform control (gamepad/trophy icon always inactive; tooltip explains auto-onboarding).
- [x] Status colors: Pending stays yellow; In The Game NC uses current Profile color (light purple); In The Game stays green; Compliance no longer shown.
- [x] Preserve existing triggers/workflows beyond the onboarding gate change (Zoho, profile updates, manual uploads, maintenance status updates).

## Implementation Checklist
### Status Computation and Labels
- [x] Update `calculateCompetitorStatus` to return `in_the_game_not_compliant` when `game_platform_id` is set but the required release is incomplete.
- [x] Update `getStatusDescription` and `getStatusDisplayLabel` to map `in_the_game_not_compliant` to "In The Game NC" with a clear description.
- [x] Update status ordering arrays (pending/profile/compliance/complete) to include the new status wherever ordering or filtering is applied.

### Game Platform Onboarding Logic
- [x] Treat `profile` as the minimum eligible status for onboarding; keep `compliance` as a legacy-allowed status.
- [x] Change auto-onboard trigger from `compliance` to `profile`.
- [x] Ensure onboarding success path still recomputes status using `calculateCompetitorStatus` and can resolve to `in_the_game_not_compliant`.
- [x] Bulk import: auto-onboard newly imported rows that compute to `profile` (currently bulk import does not trigger auto-onboarding).

### UI and Workflow Updates
- [x] Apply status color mapping: `pending` yellow, `in_the_game_not_compliant` uses the current profile color (light purple), `complete` green; remove/avoid `compliance` in UI.
- [x] Update status label display: `complete` => "In The Game", `in_the_game_not_compliant` => "In The Game NC".
- [x] Disable the "Add to Game Platform" control across the competitor list (inactive gamepad or inactive trophy icon only).
- [x] Update dashboard stats to include the new status bucket; ensure "active" remains tied to `complete` only.
- [x] Update admin analytics status breakdowns and charts to include the new status bucket.
- [x] Update game platform dashboards/rosters to display the new status without breaking sorting or filters.
- [x] Update releases page eligibility filters to include `in_the_game_not_compliant` where applicable.

### Data/View/Maintenance
- [x] Update the `release_eligible_competitors` view to include `in_the_game_not_compliant` if it should appear in Releases. (Note: view update only; no column drops.)
- [x] Update any SQL, scripts, or enums that enumerate competitor status values. (Note: enum value added if present; no column drops.)
- [ ] Run a status recompute (maintenance endpoint or SQL) to reclassify existing rows with `game_platform_id` but incomplete releases.
- [ ] Backfill onboarding for existing active competitors with status `profile` and no `game_platform_id` using the job processor (one-off run).

### Tests
- [x] Update fixtures/types to include `in_the_game_not_compliant`.
- [x] Update unit tests for onboarding to reflect the new gating (`profile` allowed) and status transitions.
- [x] Add/adjust tests for the new status computation and auto-onboard trigger.
- [x] Update any e2e workflow tests that assume compliance-only onboarding.

### Documentation
- [x] Update `docs/game-platform/game-platform-integration.md` with new onboarding gate and status definitions.
- [x] Update testing checklists and release workflow docs that reference compliance-only onboarding.
- [x] Add a short note about the backfill/status recompute step.
