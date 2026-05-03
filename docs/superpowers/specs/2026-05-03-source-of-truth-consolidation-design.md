# Source of Truth (SOT) Consolidation — Design

**Status:** Design approved (2026-05-03). Ready for implementation plan.

**Goal:** Consolidate every doc that defines the *current state of the app* — architecture, policy, compliance, integration shape, live-feature specs, and operational runbooks — into a single `docs/source-of-truth/` tree, then audit each doc against current code.

**Out of scope (deliberate):** Implementation plans, sprint summaries, point-in-time remediation work, historical bugfix notes, admin-setup playbooks, testing playbooks, local-dev how-tos. These stay in their current locations. A separate future consolidation may collect how-to / implementation docs into their own home.

---

## Decisions

| Dimension | Decision |
|---|---|
| Scope | **B** — architecture/auth + integration architecture + live-feature specs + operational runbooks. Excludes admin setup playbooks, testing playbooks, ephemera. ~25-35 files. |
| Folder name | `docs/source-of-truth/` (lowercase-dashed for URL/grep friendliness) |
| Organization | **By concern** — 5 buckets: `architecture/`, `security-and-compliance/`, `integrations/`, `features/`, `operations/` |
| Source-file treatment | **Move + grep-fix internal references**. No tombstone redirects. Old directories remain to hold any non-SOT content already there. |
| Delivery | One Phase 1 PR (consolidation) + five Phase 2 PRs (per-bucket verification) |

---

## File inventory — 28 SOT files

### `architecture/` (5 files)

| New path | Source |
|---|---|
| `architecture/coaches-dashboard-architecture.md` | `docs/architecture/Coaches Dashboard Architecture.md` |
| `architecture/authentication-standards.md` | `docs/architecture/Authentication_Standards.md` |
| `architecture/messaging-architecture.md` | `docs/messaging/complete-architecture-walkthrough.md` |
| `architecture/messaging-interface.md` | `docs/messaging/coach-messaging-interface.md` |
| `architecture/messaging-archive-use-cases.md` | `docs/messaging/archive-use-cases.md` |

### `security-and-compliance/` (6 files + 3 diagrams)

| New path | Source |
|---|---|
| `security-and-compliance/ferpa-compliance-audit-2025.md` | `docs/audit/FERPA-COMPLIANCE-AUDIT-2025.md` |
| `security-and-compliance/codebase-db-review.md` | `docs/audit/codebase-db-review.md` |
| `security-and-compliance/metactf-api-compliance-certification.md` | `docs/audit/MetaCTF_API_Compliance_Certification.md` |
| `security-and-compliance/legal/dpa-tracking.md` | `docs/audit/legal/dpa-tracking.md` |
| `security-and-compliance/legal/database-encryption.md` | `docs/audit/legal/database-encryption.md` |
| `security-and-compliance/legal/storage-encryption.md` | `docs/audit/legal/storage-encryption.md` |
| `security-and-compliance/legal/diagrams/database-setting.png` | `docs/audit/legal/DataBase Setting.png` |
| `security-and-compliance/legal/diagrams/infrastructure.png` | `docs/audit/legal/Infrastructure.png` |
| `security-and-compliance/legal/diagrams/infrastructure-versions.png` | `docs/audit/legal/Infrastructure versions.png` |

### `integrations/` (7 files)

| New path | Source |
|---|---|
| `integrations/game-platform-integration.md` | `docs/game-platform/game-platform-integration.md` |
| `integrations/game-platform-report-card-spec.md` | `docs/game-platform/game-platform-report-card-spec.md` |
| `integrations/nice-framework-integration.md` | `docs/game-platform/NICE-Integration.md` ⚠️ |
| `integrations/nice-framework-integration-lite.md` | `docs/game-platform/NICE-Integration-LITE.md` ⚠️ |
| `integrations/zoho-sign-integration.md` | `docs/zoho/zoho-sign-integration.md` |
| `integrations/zoho-manual-completion-coding-spec.md` | `docs/zoho/Manual Completion Coding Spec.md` |
| `integrations/sso-partner-integration.md` | `docs/features/SSO Partner Integration Documentation.md` |

⚠️ **NICE Integration**: both files still declare "Design Phase" in their header but the NICE feature shipped. Phase 2 reconciles to one as-built doc; the other is archived or deleted.

### `features/` (5 files)

| New path | Source |
|---|---|
| `features/analytics-implementation.md` | `docs/features/Analytics implementation.md` |
| `features/assistant-coach-delegation.md` | `docs/features/Assistant-Coach-Delegation.md` ⚠️ |
| `features/sms-admin-notification-spec.md` | `docs/sms-notifications/Admin Notification specification.md` |
| `features/sms-coach-notification-spec.md` | `docs/sms-notifications/Coach Notification specification.md` |
| `features/email-sms-coding-spec.md` | `docs/sms-notifications/email-sms-coding-spec.md` |

⚠️ **Assistant Coach Delegation** is marked "Parked" in its own header. Stays in SOT for Phase 2 review — Phase 2 either updates status to current state, moves it to a "parked features" appendix, or removes it.

### `operations/` (5 files)

| New path | Source |
|---|---|
| `operations/db-migration-runbook.md` | `docs/operations/db-migration-runbook.md` |
| `operations/github-workflow-guide.md` | `docs/operations/github-workflow-guide.md` |
| `operations/job-queue-playbook.md` | `docs/job-queue-playbook.md` |
| `operations/supabase-cron-spec.md` | `docs/cron-jobs/supabase_cron-spec.md` |
| `operations/vercel-job-processing-setup.md` | `docs/cron-jobs/vercel-job-processing-setup.md` |

---

## Files explicitly excluded (and where they stay)

Listed so nothing is silently lost. All paths below remain in their current locations.

### Plans & specs (working-state artifacts)
- `docs/superpowers/plans/*` — all implementation plans and trackers
- `docs/superpowers/specs/*` — per-project specs (this design lives here too)

### Historical audits and remediation
- `docs/audit/FERPA-CRITICAL-ISSUES-REMEDIATION-PLAN.md`
- `docs/audit/FERPA-ISSUES-2-AND-3-COMPLETE-SUMMARY.md`
- `docs/audit/ORGANIZATION-CLEANUP-SUMMARY.md`
- `docs/audit/COACH-DELETION-STRATEGY.md`
- `docs/audit/QUICK-START-GUIDE.md`
- `docs/audit/REVISED-ISSUE-1-INFRASTRUCTURE-ENCRYPTION.md`
- `docs/audit/SPRINT-1-REVISED-SIMPLE-GUIDE.md`
- `docs/audit/agreement-pdf-audit-2026-02-08T20-21-29.md`
- `docs/audit/README.md` — stub-edited to remove pointers to moved FERPA docs

### Admin setup playbooks (excluded per Scope B)
- `docs/admin/Admin Setup.md`
- `docs/admin/Admin_Setup_Guide.md`
- `docs/admin/Admin-editing-refactor.md`
- `docs/admin/admin-setup-simple.md`
- `docs/cron-jobs/ADMIN-QUICK-START.md`
- `docs/cron-jobs/admin-user-manual.md`

### Historical messaging work
- `docs/messaging/architecture-refactor-implementation.md`
- `docs/messaging/lifecycle_testing_fixes.md`
- `docs/messaging/messaging-enhancement-spec.md`
- `docs/messaging/per-user-message-state-plan.md`
- `docs/messaging/competitor-announcement-email-project-plan.md`
- `docs/messaging/messaging_schema.sql` and `messaging_schema_updates.sql` (artifacts)

### Historical game-platform work
- `docs/game-platform/BUGFIX-drill-down-zeros-2025-10-06.md`
- `docs/game-platform/MIGRATION-remove-raw-data-field.md`
- `docs/game-platform/RAW-DATA-RETIREMENT-2025-10-06.md`
- `docs/game-platform/integration-refactoring.md`
- `docs/game-platform/pre-production-tasks.md`
- `docs/game-platform/production-deployment-plan.md`
- `docs/game-platform/MetaCTF_api_definition.json` and `v2_nf_components.json` (schema artifacts)

### Testing playbooks (excluded per Scope B; future how-to consolidation)
- All 11 files under `docs/testing/`

### Local dev how-tos (future how-to consolidation)
- `docs/operations/Solving Supabase Local Development RLS Violations.md`
- `docs/operations/Supabase Auth in Local Development.md`

### Closed-out runbooks
- `docs/runbooks/2026-05-02-secret-inventory.md`

### Other
- `docs/updates/game-onboarding-bypass.md` — release/decision note
- `docs/mayors-cyber-cup-slide-1-prompt.md`, `slide-2-prompt.md` — content prompts

---

## READMEs

**6 new files in Phase 1 PR.**

- **`docs/source-of-truth/README.md`** — entry point. Sections: purpose ("this folder defines the current state of the app"), bucket map with one-line each, verification cadence ("every doc has a Last Verified footer"), how to add to SOT (PR criteria), pointer to the historical exclusions list (this design doc).
- **`source-of-truth/architecture/README.md`** — list of files with one-line summary; placeholder for verification status table populated by Phase 2.
- **`source-of-truth/security-and-compliance/README.md`** — same pattern.
- **`source-of-truth/integrations/README.md`** — same pattern.
- **`source-of-truth/features/README.md`** — same pattern.
- **`source-of-truth/operations/README.md`** — same pattern.

**Bucket README template:**

```markdown
# <Bucket name>

> Source-of-truth docs for <bucket scope>. Each doc has a Last Verified
> footer. To propose a change, edit the doc and bump the date.

## Files

| File | Purpose | Last verified |
|---|---|---|
| [Foo](./foo.md) | One-line | 2026-05-XX |
```

---

## Reference-fixing scope (Phase 1 PR)

In addition to the 28 file moves, the Phase 1 PR updates these to point at the new locations:

- **`CLAUDE.md`** (project root) — currently references `docs/architecture/Authentication_Standards.md`, `docs/messaging/`, `docs/game-platform/`, `docs/zoho`, `docs/operations/db-migration-runbook.md`. Update.
- **`docs/README.md`** (top-level) — currently a docs index; rewrite to point primarily at `source-of-truth/README.md` and note where non-SOT material lives.
- **`docs/audit/README.md`** — its index pointed at FERPA docs that have moved. Trim to the historical files that remain.
- **Internal cross-doc links** — links between the moved files (e.g., one architecture doc linking to another). Repathed during the move.
- **Recent PR descriptions and commit messages** — frozen in time; not updated.
- **Code comments** — only updated if they contain a doc path that's moved. Spot-check via grep, not exhaustive.

---

## Phase 2 — verification approach

After Phase 1 PR merges, deliver **5 sequential PRs** (one per bucket). Order:

1. `architecture/`
2. `security-and-compliance/`
3. `integrations/`
4. `features/`
5. `operations/`

For each doc:

1. Read the doc end-to-end.
2. Verify each substantive claim against current code:
   - File paths exist
   - Referenced functions / RPCs / tables / env vars exist and match
   - Architecture diagrams reflect current code shape
   - Compliance claims still hold (e.g., FERPA controls still in place)
3. Inline edits for anything stale. If a section is fundamentally wrong, replace; if minor drift, patch.
4. Add a footer:
   ```markdown
   ---
   **Last verified:** 2026-05-XX against commit `<sha>`.
   **Notes:** <optional — gaps, follow-ups, SME questions>
   ```
5. Update the bucket README's verification table with status:
   - ✅ Verified — accurate as of commit
   - ✏️ Updated — corrections applied during verification
   - ⚠️ SME needed — section requires domain-owner input
   - 🗑 Should be archived — doc is obsolete; flag for removal next review

A doc that requires deep SME input gets `⚠️` and a Linear/issue link rather than blocking the PR.

---

## Delivery sequence

| PR | Title | Scope |
|---|---|---|
| #1 | Source of Truth: consolidation (Phase 1) | 28 file moves + 6 READMEs + reference fixes in CLAUDE.md and docs/README.md. ~30-35 changed files. |
| #2 | SOT verification: architecture | Per-doc verification of 5 architecture files. |
| #3 | SOT verification: security & compliance | 6 docs (+ 3 diagrams). |
| #4 | SOT verification: integrations | 7 docs. NICE-LITE-vs-full reconciliation here. |
| #5 | SOT verification: features | 5 docs. Assistant Coach Delegation status decision here. |
| #6 | SOT verification: operations | 5 docs. |

Each Phase 2 PR can ship independently as soon as its bucket is verified.

---

## Open questions for Phase 2 (not blocking Phase 1)

- **NICE Integration LITE vs full** — which is the as-built? Reconcile during integration verification PR.
- **Assistant Coach Delegation** — parked per its own header. Move to "parked features" subsection inside the bucket, or remove entirely from SOT?
- **`docs/runbooks/`** — currently holds one closed-out historical file. Should this directory be merged into `source-of-truth/operations/` for consistency, or stay as the historical home? (Out of Phase-1 scope; revisit after Phase 2 ops PR.)

---

## Self-review

- **No placeholders.** Every file in the inventory has a concrete source path and target path.
- **Internal consistency.** The exclusion list explicitly accounts for every file in `docs/` that wasn't moved; no silent drops.
- **Scope check.** Phase 1 is a single PR. Phase 2 is bounded — 5 PRs, one per bucket, with concrete acceptance criteria (verification footer + README status update).
- **Ambiguity.** Three flagged decisions (NICE LITE vs full, Assistant Coach Delegation status, `docs/runbooks/` future) are explicitly deferred to Phase 2 with named PRs.
