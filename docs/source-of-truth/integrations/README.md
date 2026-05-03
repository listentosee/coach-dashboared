# Integrations

External system contracts — game platform (MetaCTF, NICE), Zoho Sign, SSO partners.

## Files

| File | Purpose | Last verified |
|---|---|---|
| [game-platform-integration.md](./game-platform-integration.md) | Coach Dashboard ↔ MetaCTF integration | 2026-05-03 (`5b49f3ef`) |
| [game-platform-report-card-spec.md](./game-platform-report-card-spec.md) | Per-competitor report card feature spec | 2026-05-03 (`5b49f3ef`) |
| [nice-framework-integration-lite.md](./nice-framework-integration-lite.md) | NIST NICE Framework integration (lookup table for work-role codes) — canonical | 2026-05-03 (`5b49f3ef`) |
| [zoho-sign-integration.md](./zoho-sign-integration.md) | Zoho Sign agreements/release-form integration | 2026-05-03 (`5b49f3ef`) |
| [zoho-manual-completion-coding-spec.md](./zoho-manual-completion-coding-spec.md) | Print-and-sign manual completion path | 2026-05-03 (`5b49f3ef`) |
| [sso-partner-integration.md](./sso-partner-integration.md) | Partner SSO integration notes (CyberNuggets outbound) | 2026-05-03 (`5b49f3ef`) |

## Phase 2 reconciliation notes

- The full-scope NICE Framework design (extra reference tables for tasks, junction tables, structured `nice_work_roles[]` column on challenge solves, dedicated service/RPCs for analytics) was never built. It has been moved out of SOT to [`docs/game-platform/historical-nice-full-design.md`](../../game-platform/historical-nice-full-design.md) for future reference. The shipped LITE integration above is the canonical source of truth.
- The MetaCTF outbound SSO route (`app/api/metactf/sso/route.ts`) ships but is not yet documented in this bucket — see the open concern in `sso-partner-integration.md`.
