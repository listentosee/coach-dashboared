# Source of Truth Consolidation — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move 28 source-of-truth docs into `docs/source-of-truth/{architecture,security-and-compliance,integrations,features,operations}/`, scaffold READMEs, and fix all internal references — without touching the actual SOT content (Phase 2 verifies content separately).

**Architecture:** Pure file reorganization. `git mv` preserves history; bucket-by-bucket commits keep diffs reviewable; a final cleanup task fixes cross-references in moved docs and updates `CLAUDE.md` / `docs/README.md`.

**Tech Stack:** git, grep, sed-style edits via the Edit tool. No code, no build, no tests.

**Reference spec:** [`docs/superpowers/specs/2026-05-03-source-of-truth-consolidation-design.md`](../specs/2026-05-03-source-of-truth-consolidation-design.md)

**Branch:** Work on a feature branch `docs/sot-consolidation` off `main` (worktree flag is "no").

---

## Pre-flight

### Branch setup

```bash
cd "/Users/scottyoung/Cursor Projects/coach-dashboared"
git checkout main
git pull --ff-only origin main
git checkout -b docs/sot-consolidation
```

If the spec branch (`docs/sot-consolidation-design`) is still around with the spec committed but not yet merged to main, **cherry-pick the spec commit onto this branch** so this PR ships both the spec record and the consolidation in one PR:

```bash
# from docs/sot-consolidation, with main as base
git cherry-pick <spec-commit-sha>
```

The spec commit SHA is on `docs/sot-consolidation-design`. Run `git log docs/sot-consolidation-design --oneline -5` to find it.

### Sanity baseline

```bash
# What docs exist today? Use depth 4 so we capture audit/legal/*.png today
# AND source-of-truth/security-and-compliance/legal/diagrams/*.png after move.
find docs -maxdepth 4 -type f \( -name "*.md" -o -name "*.png" \) | wc -l
```

Save this number. The post-consolidation count (Task 7 Step 6) must be **baseline + 7** — accounting for the 6 new bucket READMEs and this plan file (added during the PR but not in baseline).

---

## Task 1: Create directory skeleton + 6 README scaffolds

**Why:** Buckets need to exist before files move into them. READMEs are scaffolded with placeholder file tables that get populated in subsequent move tasks.

**Files:**
- Create: `docs/source-of-truth/README.md`
- Create: `docs/source-of-truth/architecture/README.md`
- Create: `docs/source-of-truth/security-and-compliance/README.md`
- Create: `docs/source-of-truth/security-and-compliance/legal/diagrams/.gitkeep`
- Create: `docs/source-of-truth/integrations/README.md`
- Create: `docs/source-of-truth/features/README.md`
- Create: `docs/source-of-truth/operations/README.md`

- [ ] **Step 1: Create directory tree**

```bash
cd "/Users/scottyoung/Cursor Projects/coach-dashboared"
mkdir -p docs/source-of-truth/{architecture,integrations,features,operations}
mkdir -p docs/source-of-truth/security-and-compliance/legal/diagrams
```

- [ ] **Step 2: Write top-level README**

Create `docs/source-of-truth/README.md` with this content verbatim:

```markdown
# Source of Truth

This folder is the canonical description of the **current state of the app**. Each doc here is verified against the live code and dated.

## Buckets

| Bucket | Scope |
|---|---|
| [architecture/](./architecture/) | System shape — how the app is structured (Coach Dashboard architecture, auth standards, messaging architecture) |
| [security-and-compliance/](./security-and-compliance/) | FERPA audit, data encryption, DPA tracking, MetaCTF compliance |
| [integrations/](./integrations/) | External systems — game platform (MetaCTF, NICE), Zoho Sign, SSO partners |
| [features/](./features/) | Live-feature specs — analytics, notifications, etc. |
| [operations/](./operations/) | Runbooks for running the system — DB migrations, GitHub workflow, job queue, cron |

## Conventions

- **Filenames** are lowercase-dashed (`my-doc.md`).
- **Each doc has a `Last verified:` footer** with a date and commit SHA. If you change a doc, bump the date.
- **Bucket READMEs** carry the verification status table for that bucket.

## Adding to SOT

Open a PR that:
1. Adds the new doc under the appropriate bucket.
2. Updates the bucket README's file table.
3. Adds a `Last verified:` footer dated today.

If the new doc replaces something elsewhere in `docs/`, delete the original or replace it with a stub redirect. Don't keep duplicates.

## What's NOT here

Implementation plans, sprint summaries, point-in-time audits, admin setup playbooks, testing playbooks, local-dev how-tos, and historical bugfix notes stay in their original `docs/` subdirectories. See [the consolidation design](../superpowers/specs/2026-05-03-source-of-truth-consolidation-design.md) for the full exclusion list and rationale.
```

- [ ] **Step 3: Write 5 bucket READMEs (scaffold)**

Each bucket README uses the same scaffold. Create them with empty status tables — Tasks 2-6 fill them in as files are moved.

`docs/source-of-truth/architecture/README.md`:

```markdown
# Architecture

System-shape documentation — how the app is structured. Update or add when the system's architecture changes.

## Files

| File | Purpose | Last verified |
|---|---|---|
| _populated as files land_ | | |
```

`docs/source-of-truth/security-and-compliance/README.md`:

```markdown
# Security & Compliance

FERPA audit, data encryption posture, DPA tracking, third-party API compliance.

## Files

| File | Purpose | Last verified |
|---|---|---|
| _populated as files land_ | | |
```

`docs/source-of-truth/integrations/README.md`:

```markdown
# Integrations

External system contracts — game platform (MetaCTF, NICE), Zoho Sign, SSO partners.

## Files

| File | Purpose | Last verified |
|---|---|---|
| _populated as files land_ | | |
```

`docs/source-of-truth/features/README.md`:

```markdown
# Features

Live-feature specifications.

## Files

| File | Purpose | Last verified |
|---|---|---|
| _populated as files land_ | | |
```

`docs/source-of-truth/operations/README.md`:

```markdown
# Operations

Runbooks for running, deploying, and maintaining the system.

## Files

| File | Purpose | Last verified |
|---|---|---|
| _populated as files land_ | | |
```

- [ ] **Step 4: Add `.gitkeep` to the empty diagrams subdir**

```bash
touch docs/source-of-truth/security-and-compliance/legal/diagrams/.gitkeep
```

- [ ] **Step 5: Commit the skeleton**

```bash
git add docs/source-of-truth/
git commit -m "docs(sot): scaffold source-of-truth directory + READMEs"
```

---

## Task 2: Move `architecture/` bucket (5 files)

**Files:**
- Move + rename: `docs/architecture/Coaches Dashboard Architecture.md` → `docs/source-of-truth/architecture/coaches-dashboard-architecture.md`
- Move + rename: `docs/architecture/Authentication_Standards.md` → `docs/source-of-truth/architecture/authentication-standards.md`
- Move + rename: `docs/messaging/complete-architecture-walkthrough.md` → `docs/source-of-truth/architecture/messaging-architecture.md`
- Move + rename: `docs/messaging/coach-messaging-interface.md` → `docs/source-of-truth/architecture/messaging-interface.md`
- Move + rename: `docs/messaging/archive-use-cases.md` → `docs/source-of-truth/architecture/messaging-archive-use-cases.md`
- Modify: `docs/source-of-truth/architecture/README.md`

- [ ] **Step 1: `git mv` the 5 files (with rename)**

```bash
cd "/Users/scottyoung/Cursor Projects/coach-dashboared"
git mv "docs/architecture/Coaches Dashboard Architecture.md" \
        docs/source-of-truth/architecture/coaches-dashboard-architecture.md
git mv  docs/architecture/Authentication_Standards.md \
        docs/source-of-truth/architecture/authentication-standards.md
git mv  docs/messaging/complete-architecture-walkthrough.md \
        docs/source-of-truth/architecture/messaging-architecture.md
git mv  docs/messaging/coach-messaging-interface.md \
        docs/source-of-truth/architecture/messaging-interface.md
git mv  docs/messaging/archive-use-cases.md \
        docs/source-of-truth/architecture/messaging-archive-use-cases.md
```

- [ ] **Step 2: Verify the 5 files landed**

```bash
ls docs/source-of-truth/architecture/
```

Expected: `README.md`, `authentication-standards.md`, `coaches-dashboard-architecture.md`, `messaging-archive-use-cases.md`, `messaging-architecture.md`, `messaging-interface.md` (6 entries).

- [ ] **Step 3: Verify originals are gone**

```bash
ls docs/architecture/ docs/messaging/ 2>&1 | grep -E "Architecture|Authentication|complete-architecture|coach-messaging-interface|archive-use-cases"
```

Expected: empty output.

- [ ] **Step 4: Update bucket README with file list**

Replace the placeholder row in `docs/source-of-truth/architecture/README.md` with the actual file table:

```markdown
| File | Purpose | Last verified |
|---|---|---|
| [authentication-standards.md](./authentication-standards.md) | Server, client, middleware auth rules; wrapper layer; service-role policy | _Phase 2_ |
| [coaches-dashboard-architecture.md](./coaches-dashboard-architecture.md) | Whole-system architecture and component map | _Phase 2_ |
| [messaging-architecture.md](./messaging-architecture.md) | Messaging system architecture walkthrough | _Phase 2_ |
| [messaging-interface.md](./messaging-interface.md) | Coach-facing messaging UI specification | _Phase 2_ |
| [messaging-archive-use-cases.md](./messaging-archive-use-cases.md) | Archive behavior — current and proposed use cases | _Phase 2_ |
```

- [ ] **Step 5: Commit the bucket**

```bash
git add docs/source-of-truth/architecture/ docs/architecture/ docs/messaging/
git commit -m "docs(sot): move architecture bucket (5 files)"
```

---

## Task 3: Move `security-and-compliance/` bucket (6 files + 3 diagrams)

**Files:**
- Move + rename: `docs/audit/FERPA-COMPLIANCE-AUDIT-2025.md` → `docs/source-of-truth/security-and-compliance/ferpa-compliance-audit-2025.md`
- Move + rename: `docs/audit/codebase-db-review.md` → `docs/source-of-truth/security-and-compliance/codebase-db-review.md`
- Move + rename: `docs/audit/MetaCTF_API_Compliance_Certification.md` → `docs/source-of-truth/security-and-compliance/metactf-api-compliance-certification.md`
- Move: `docs/audit/legal/dpa-tracking.md` → `docs/source-of-truth/security-and-compliance/legal/dpa-tracking.md`
- Move: `docs/audit/legal/database-encryption.md` → `docs/source-of-truth/security-and-compliance/legal/database-encryption.md`
- Move: `docs/audit/legal/storage-encryption.md` → `docs/source-of-truth/security-and-compliance/legal/storage-encryption.md`
- Move + rename: `docs/audit/legal/DataBase Setting.png` → `docs/source-of-truth/security-and-compliance/legal/diagrams/database-setting.png`
- Move + rename: `docs/audit/legal/Infrastructure.png` → `docs/source-of-truth/security-and-compliance/legal/diagrams/infrastructure.png`
- Move + rename: `docs/audit/legal/Infrastructure versions.png` → `docs/source-of-truth/security-and-compliance/legal/diagrams/infrastructure-versions.png`
- Modify: `docs/source-of-truth/security-and-compliance/README.md`

- [ ] **Step 1: `git mv` markdown files**

```bash
cd "/Users/scottyoung/Cursor Projects/coach-dashboared"
git mv  docs/audit/FERPA-COMPLIANCE-AUDIT-2025.md \
        docs/source-of-truth/security-and-compliance/ferpa-compliance-audit-2025.md
git mv  docs/audit/codebase-db-review.md \
        docs/source-of-truth/security-and-compliance/codebase-db-review.md
git mv  docs/audit/MetaCTF_API_Compliance_Certification.md \
        docs/source-of-truth/security-and-compliance/metactf-api-compliance-certification.md
git mv  docs/audit/legal/dpa-tracking.md \
        docs/source-of-truth/security-and-compliance/legal/dpa-tracking.md
git mv  docs/audit/legal/database-encryption.md \
        docs/source-of-truth/security-and-compliance/legal/database-encryption.md
git mv  docs/audit/legal/storage-encryption.md \
        docs/source-of-truth/security-and-compliance/legal/storage-encryption.md
```

- [ ] **Step 2: `git mv` diagrams (with rename)**

```bash
git mv "docs/audit/legal/DataBase Setting.png" \
        docs/source-of-truth/security-and-compliance/legal/diagrams/database-setting.png
git mv  docs/audit/legal/Infrastructure.png \
        docs/source-of-truth/security-and-compliance/legal/diagrams/infrastructure.png
git mv "docs/audit/legal/Infrastructure versions.png" \
        docs/source-of-truth/security-and-compliance/legal/diagrams/infrastructure-versions.png
```

- [ ] **Step 3: Remove the now-unused .gitkeep**

```bash
rm docs/source-of-truth/security-and-compliance/legal/diagrams/.gitkeep
```

- [ ] **Step 4: Verify**

```bash
ls docs/source-of-truth/security-and-compliance/
ls docs/source-of-truth/security-and-compliance/legal/
ls docs/source-of-truth/security-and-compliance/legal/diagrams/
```

Expected:
- top: `README.md`, `codebase-db-review.md`, `ferpa-compliance-audit-2025.md`, `legal/`, `metactf-api-compliance-certification.md`
- legal: `database-encryption.md`, `diagrams/`, `dpa-tracking.md`, `storage-encryption.md`
- diagrams: `database-setting.png`, `infrastructure-versions.png`, `infrastructure.png`

- [ ] **Step 5: Update bucket README**

Replace the placeholder row in `docs/source-of-truth/security-and-compliance/README.md`:

```markdown
| File | Purpose | Last verified |
|---|---|---|
| [ferpa-compliance-audit-2025.md](./ferpa-compliance-audit-2025.md) | FERPA controls inventory and audit findings | _Phase 2_ |
| [codebase-db-review.md](./codebase-db-review.md) | Static review of the codebase + DB schema | _Phase 2_ |
| [metactf-api-compliance-certification.md](./metactf-api-compliance-certification.md) | MetaCTF API compliance attestation | _Phase 2_ |
| [legal/dpa-tracking.md](./legal/dpa-tracking.md) | Data Processing Agreements with sub-processors | _Phase 2_ |
| [legal/database-encryption.md](./legal/database-encryption.md) | Database encryption-at-rest documentation | _Phase 2_ |
| [legal/storage-encryption.md](./legal/storage-encryption.md) | Supabase Storage bucket encryption documentation | _Phase 2_ |
```

- [ ] **Step 6: Commit**

```bash
git add docs/source-of-truth/security-and-compliance/ docs/audit/
git commit -m "docs(sot): move security-and-compliance bucket (6 files + 3 diagrams)"
```

---

## Task 4: Move `integrations/` bucket (7 files)

**Files:**
- Move: `docs/game-platform/game-platform-integration.md` → `docs/source-of-truth/integrations/game-platform-integration.md`
- Move: `docs/game-platform/game-platform-report-card-spec.md` → `docs/source-of-truth/integrations/game-platform-report-card-spec.md`
- Move + rename: `docs/game-platform/NICE-Integration.md` → `docs/source-of-truth/integrations/nice-framework-integration.md`
- Move + rename: `docs/game-platform/NICE-Integration-LITE.md` → `docs/source-of-truth/integrations/nice-framework-integration-lite.md`
- Move: `docs/zoho/zoho-sign-integration.md` → `docs/source-of-truth/integrations/zoho-sign-integration.md`
- Move + rename: `docs/zoho/Manual Completion Coding Spec.md` → `docs/source-of-truth/integrations/zoho-manual-completion-coding-spec.md`
- Move + rename: `docs/features/SSO Partner Integration Documentation.md` → `docs/source-of-truth/integrations/sso-partner-integration.md`
- Modify: `docs/source-of-truth/integrations/README.md`

- [ ] **Step 1: `git mv` the 7 files**

```bash
cd "/Users/scottyoung/Cursor Projects/coach-dashboared"
git mv  docs/game-platform/game-platform-integration.md \
        docs/source-of-truth/integrations/game-platform-integration.md
git mv  docs/game-platform/game-platform-report-card-spec.md \
        docs/source-of-truth/integrations/game-platform-report-card-spec.md
git mv  docs/game-platform/NICE-Integration.md \
        docs/source-of-truth/integrations/nice-framework-integration.md
git mv  docs/game-platform/NICE-Integration-LITE.md \
        docs/source-of-truth/integrations/nice-framework-integration-lite.md
git mv  docs/zoho/zoho-sign-integration.md \
        docs/source-of-truth/integrations/zoho-sign-integration.md
git mv "docs/zoho/Manual Completion Coding Spec.md" \
        docs/source-of-truth/integrations/zoho-manual-completion-coding-spec.md
git mv "docs/features/SSO Partner Integration Documentation.md" \
        docs/source-of-truth/integrations/sso-partner-integration.md
```

- [ ] **Step 2: Verify**

```bash
ls docs/source-of-truth/integrations/
```

Expected: `README.md`, `game-platform-integration.md`, `game-platform-report-card-spec.md`, `nice-framework-integration-lite.md`, `nice-framework-integration.md`, `sso-partner-integration.md`, `zoho-manual-completion-coding-spec.md`, `zoho-sign-integration.md` (8 entries).

- [ ] **Step 3: Update bucket README**

Replace the placeholder row in `docs/source-of-truth/integrations/README.md`:

```markdown
| File | Purpose | Last verified |
|---|---|---|
| [game-platform-integration.md](./game-platform-integration.md) | Coach Dashboard ↔ MetaCTF integration | _Phase 2_ |
| [game-platform-report-card-spec.md](./game-platform-report-card-spec.md) | Per-competitor report card feature spec | _Phase 2_ |
| [nice-framework-integration.md](./nice-framework-integration.md) | NIST NICE Framework integration ⚠️ Phase 2: reconcile vs LITE | _Phase 2_ |
| [nice-framework-integration-lite.md](./nice-framework-integration-lite.md) | NICE LITE scope ⚠️ Phase 2: reconcile vs full | _Phase 2_ |
| [zoho-sign-integration.md](./zoho-sign-integration.md) | Zoho Sign agreements/release-form integration | _Phase 2_ |
| [zoho-manual-completion-coding-spec.md](./zoho-manual-completion-coding-spec.md) | Print-and-sign manual completion path | _Phase 2_ |
| [sso-partner-integration.md](./sso-partner-integration.md) | Partner SSO integration notes (CyberNuggets etc.) | _Phase 2_ |
```

- [ ] **Step 4: Commit**

```bash
git add docs/source-of-truth/integrations/ docs/game-platform/ docs/zoho/ docs/features/
git commit -m "docs(sot): move integrations bucket (7 files)"
```

---

## Task 5: Move `features/` bucket (5 files)

**Files:**
- Move + rename: `docs/features/Analytics implementation.md` → `docs/source-of-truth/features/analytics-implementation.md`
- Move + rename: `docs/features/Assistant-Coach-Delegation.md` → `docs/source-of-truth/features/assistant-coach-delegation.md`
- Move + rename: `docs/sms-notifications/Admin Notification specification.md` → `docs/source-of-truth/features/sms-admin-notification-spec.md`
- Move + rename: `docs/sms-notifications/Coach Notification specification.md` → `docs/source-of-truth/features/sms-coach-notification-spec.md`
- Move: `docs/sms-notifications/email-sms-coding-spec.md` → `docs/source-of-truth/features/email-sms-coding-spec.md`
- Modify: `docs/source-of-truth/features/README.md`

- [ ] **Step 1: `git mv` the 5 files**

```bash
cd "/Users/scottyoung/Cursor Projects/coach-dashboared"
git mv "docs/features/Analytics implementation.md" \
        docs/source-of-truth/features/analytics-implementation.md
git mv  docs/features/Assistant-Coach-Delegation.md \
        docs/source-of-truth/features/assistant-coach-delegation.md
git mv "docs/sms-notifications/Admin Notification specification.md" \
        docs/source-of-truth/features/sms-admin-notification-spec.md
git mv "docs/sms-notifications/Coach Notification specification.md" \
        docs/source-of-truth/features/sms-coach-notification-spec.md
git mv  docs/sms-notifications/email-sms-coding-spec.md \
        docs/source-of-truth/features/email-sms-coding-spec.md
```

- [ ] **Step 2: Verify**

```bash
ls docs/source-of-truth/features/
```

Expected: `README.md`, `analytics-implementation.md`, `assistant-coach-delegation.md`, `email-sms-coding-spec.md`, `sms-admin-notification-spec.md`, `sms-coach-notification-spec.md` (6 entries).

- [ ] **Step 3: Update bucket README**

Replace the placeholder row in `docs/source-of-truth/features/README.md`:

```markdown
| File | Purpose | Last verified |
|---|---|---|
| [analytics-implementation.md](./analytics-implementation.md) | Admin analytics dashboard implementation | _Phase 2_ |
| [assistant-coach-delegation.md](./assistant-coach-delegation.md) | Assistant-coach delegation (header says Parked) ⚠️ Phase 2: confirm status | _Phase 2_ |
| [sms-admin-notification-spec.md](./sms-admin-notification-spec.md) | Admin SMS notification specification | _Phase 2_ |
| [sms-coach-notification-spec.md](./sms-coach-notification-spec.md) | Coach SMS notification specification | _Phase 2_ |
| [email-sms-coding-spec.md](./email-sms-coding-spec.md) | Email + SMS notification coding spec | _Phase 2_ |
```

- [ ] **Step 4: Commit**

```bash
git add docs/source-of-truth/features/ docs/features/ docs/sms-notifications/
git commit -m "docs(sot): move features bucket (5 files)"
```

---

## Task 6: Move `operations/` bucket (5 files)

**Files:**
- Move: `docs/operations/db-migration-runbook.md` → `docs/source-of-truth/operations/db-migration-runbook.md`
- Move: `docs/operations/github-workflow-guide.md` → `docs/source-of-truth/operations/github-workflow-guide.md`
- Move: `docs/job-queue-playbook.md` → `docs/source-of-truth/operations/job-queue-playbook.md`
- Move + rename: `docs/cron-jobs/supabase_cron-spec.md` → `docs/source-of-truth/operations/supabase-cron-spec.md`
- Move: `docs/cron-jobs/vercel-job-processing-setup.md` → `docs/source-of-truth/operations/vercel-job-processing-setup.md`
- Modify: `docs/source-of-truth/operations/README.md`

- [ ] **Step 1: `git mv` the 5 files**

```bash
cd "/Users/scottyoung/Cursor Projects/coach-dashboared"
git mv  docs/operations/db-migration-runbook.md \
        docs/source-of-truth/operations/db-migration-runbook.md
git mv  docs/operations/github-workflow-guide.md \
        docs/source-of-truth/operations/github-workflow-guide.md
git mv  docs/job-queue-playbook.md \
        docs/source-of-truth/operations/job-queue-playbook.md
git mv  docs/cron-jobs/supabase_cron-spec.md \
        docs/source-of-truth/operations/supabase-cron-spec.md
git mv  docs/cron-jobs/vercel-job-processing-setup.md \
        docs/source-of-truth/operations/vercel-job-processing-setup.md
```

- [ ] **Step 2: Verify**

```bash
ls docs/source-of-truth/operations/
```

Expected: `README.md`, `db-migration-runbook.md`, `github-workflow-guide.md`, `job-queue-playbook.md`, `supabase-cron-spec.md`, `vercel-job-processing-setup.md` (6 entries).

- [ ] **Step 3: Update bucket README**

Replace the placeholder row in `docs/source-of-truth/operations/README.md`:

```markdown
| File | Purpose | Last verified |
|---|---|---|
| [db-migration-runbook.md](./db-migration-runbook.md) | Database migration workflow (preview + prod) | _Phase 2_ |
| [github-workflow-guide.md](./github-workflow-guide.md) | Branching, PR, and preview-environment workflow | _Phase 2_ |
| [job-queue-playbook.md](./job-queue-playbook.md) | Background job queue operations | _Phase 2_ |
| [supabase-cron-spec.md](./supabase-cron-spec.md) | Supabase Cron + Edge Function operations | _Phase 2_ |
| [vercel-job-processing-setup.md](./vercel-job-processing-setup.md) | Vercel-side job-processing setup | _Phase 2_ |
```

- [ ] **Step 4: Commit**

```bash
git add docs/source-of-truth/operations/ docs/operations/ docs/cron-jobs/ docs/job-queue-playbook.md
git commit -m "docs(sot): move operations bucket (5 files)"
```

---

## Task 7: Source-of-truth documentation updates

**Why:** Tasks 1-6 reorganize files but leave external references stale. `CLAUDE.md`, `docs/README.md`, and `docs/audit/README.md` all link to paths that no longer exist; cross-references inside the moved docs themselves likewise need repathing. This is the mandatory final task for this plan.

**Files:**
- Modify: `CLAUDE.md` (project root)
- Modify: `docs/README.md`
- Modify: `docs/audit/README.md`
- Modify: any moved doc whose internal links reference another moved doc (discovered via grep)

- [ ] **Step 1: `CLAUDE.md` updates**

Read `CLAUDE.md` and patch each path reference to point at its new SOT location. Concrete edits:

| Old reference | New reference |
|---|---|
| `docs/architecture/Authentication_Standards.md` | `docs/source-of-truth/architecture/authentication-standards.md` |
| `docs/messaging/` (general directory reference) | `docs/source-of-truth/architecture/` (for messaging architecture) — keep `docs/messaging/` for historical files that remain |
| `docs/game-platform/` (general directory reference) | `docs/source-of-truth/integrations/` (for live integration spec) |
| `docs/zoho` (general directory reference) | `docs/source-of-truth/integrations/zoho-sign-integration.md` |
| `docs/operations/db-migration-runbook.md` | `docs/source-of-truth/operations/db-migration-runbook.md` |

Find each via grep and replace via Edit tool:

```bash
grep -n "docs/architecture/\|docs/messaging/\|docs/game-platform/\|docs/zoho\|docs/operations/db-migration\|docs/operations/github-workflow\|docs/job-queue-playbook\|docs/audit/FERPA\|docs/audit/codebase-db-review\|docs/audit/MetaCTF\|docs/audit/legal/\|docs/sms-notifications/\|docs/features/Analytics\|docs/features/Assistant\|docs/features/SSO\|docs/cron-jobs/supabase_cron\|docs/cron-jobs/vercel-job" CLAUDE.md
```

For each match, replace with the corresponding `docs/source-of-truth/<bucket>/<new-filename>.md` path.

- [ ] **Step 2: `docs/README.md` updates**

Read the file. If it's a docs index, rewrite the content section to point primarily at `source-of-truth/README.md` while keeping any references to non-SOT areas (admin/, testing/, audit/ historical) accurate.

The new `docs/README.md` body should look like this (replace existing index section, keep any unrelated front-matter):

```markdown
# Coach Dashboard — Documentation

The canonical description of the current state of the app lives in **[source-of-truth/](./source-of-truth/)**. Start there.

## Folders

- **[source-of-truth/](./source-of-truth/)** — architecture, security & compliance, integrations, features, operations
- **[admin/](./admin/)** — admin setup playbooks
- **[audit/](./audit/)** — historical FERPA remediation work and sprint summaries
- **[cron-jobs/](./cron-jobs/)** — admin playbooks for cron + job queue (the live spec lives in `source-of-truth/operations/`)
- **[features/](./features/)** — historical feature notes (live specs are in `source-of-truth/features/`)
- **[game-platform/](./game-platform/)** — historical migrations and bugfix notes (live integration specs are in `source-of-truth/integrations/`)
- **[messaging/](./messaging/)** — historical messaging implementation work (live architecture is in `source-of-truth/architecture/`)
- **[operations/](./operations/)** — local-dev how-tos (production runbooks are in `source-of-truth/operations/`)
- **[runbooks/](./runbooks/)** — closed-out historical rotation runbooks
- **[superpowers/](./superpowers/)** — implementation plans and per-project specs
- **[testing/](./testing/)** — testing playbooks and historical phase tests
- **[zoho/](./zoho/)** — historical zoho work (live spec in `source-of-truth/integrations/`)
```

- [ ] **Step 3: `docs/audit/README.md` updates**

Read the file. It used to index FERPA docs that have moved. Trim it to point at the historical files that remain (FERPA-CRITICAL-ISSUES-REMEDIATION-PLAN, FERPA-ISSUES-2-AND-3-COMPLETE-SUMMARY, ORGANIZATION-CLEANUP-SUMMARY, etc.) and add a one-liner at the top:

```markdown
> The current FERPA audit and compliance documentation has moved to
> [`docs/source-of-truth/security-and-compliance/`](../source-of-truth/security-and-compliance/).
> The files below are historical remediation plans and sprint summaries kept
> for reference.
```

- [ ] **Step 4: Fix internal cross-references inside moved SOT docs**

Some moved docs link to OTHER moved docs by their old paths. Run a comprehensive grep across the new SOT tree:

```bash
# References to old docs/ paths from inside the new SOT tree
grep -rnE "docs/(architecture|messaging|game-platform|zoho|operations|audit|features|sms-notifications|cron-jobs|job-queue-playbook)" docs/source-of-truth/ --include="*.md"
```

For each hit, identify the new SOT path of the target and patch the link via the Edit tool. (The list will likely be small — under 20 hits.)

Also fix references with old casing/spaces (e.g., `Authentication_Standards.md`, `Coaches Dashboard Architecture.md`):

```bash
grep -rnE "Authentication_Standards|Coaches Dashboard Architecture|complete-architecture-walkthrough|coach-messaging-interface|archive-use-cases|FERPA-COMPLIANCE-AUDIT-2025|MetaCTF_API_Compliance_Certification|NICE-Integration|Manual Completion Coding Spec|SSO Partner Integration|Analytics implementation|Assistant-Coach-Delegation|Admin Notification specification|Coach Notification specification|email-sms-coding-spec|db-migration-runbook|github-workflow-guide|job-queue-playbook|supabase_cron-spec|vercel-job-processing-setup" docs/source-of-truth/ --include="*.md"
```

For each hit, patch via Edit tool. Match the new lowercase-dashed filename.

- [ ] **Step 5: Sanity grep across whole repo for stale references**

```bash
# Repo-wide search for old paths (excluding the sources we expect to find them in: superpowers/specs, superpowers/plans, git history)
grep -rn "docs/architecture/Authentication_Standards\|docs/architecture/Coaches Dashboard Architecture\|docs/messaging/complete-architecture-walkthrough\|docs/messaging/coach-messaging-interface\|docs/messaging/archive-use-cases\|docs/audit/FERPA-COMPLIANCE-AUDIT-2025\|docs/audit/MetaCTF_API_Compliance_Certification\|docs/audit/codebase-db-review\|docs/audit/legal/\|docs/game-platform/game-platform-integration\|docs/game-platform/game-platform-report-card-spec\|docs/game-platform/NICE-Integration\|docs/zoho/zoho-sign-integration\|docs/zoho/Manual Completion Coding Spec\|docs/features/SSO Partner\|docs/features/Analytics implementation\|docs/features/Assistant-Coach-Delegation\|docs/sms-notifications/\|docs/operations/db-migration-runbook\|docs/operations/github-workflow-guide\|docs/job-queue-playbook\|docs/cron-jobs/supabase_cron-spec\|docs/cron-jobs/vercel-job-processing-setup" \
  --include="*.md" --include="*.ts" --include="*.tsx" --include="*.json" --include="*.yml" --include="*.yaml" \
  -r . 2>/dev/null \
  | grep -vE "^./docs/superpowers/(specs|plans)/|^./node_modules/|^./.next/|^./.git/"
```

For any remaining hit OUTSIDE `docs/superpowers/{specs,plans}/` and `node_modules/.next/.git/`, patch via the Edit tool. (`docs/superpowers/specs/` and `docs/superpowers/plans/` are historical records that intentionally reference the original paths — leave those alone.)

- [ ] **Step 6: Final file count sanity check**

```bash
find docs -maxdepth 4 -type f \( -name "*.md" -o -name "*.png" \) | wc -l
```

Compare to the pre-flight baseline. Expected: **baseline + 7** (6 new bucket READMEs + 1 plan file, if the plan wasn't already counted). If the count doesn't match, a file was lost during a `git mv` — diagnose with `git status` before committing.

- [ ] **Step 7: Commit doc updates in a single reviewable commit**

```bash
git add CLAUDE.md docs/README.md docs/audit/README.md docs/source-of-truth/
git commit -m "docs(sot): update CLAUDE.md, docs/README.md, audit/README + cross-doc links"
```

---

## Execution-grouping notes

- Tasks 1-6 are file-move-only — can be one continuous session (~30-45 minutes).
- Task 7 is the cleanup — should follow Tasks 1-6 in the same session so the references are fixed in the same PR. Estimated 15-30 minutes depending on how many cross-references exist.
- Total estimated effort: ~1-1.5 hours for one engineer; faster with subagents.

After this plan ships, **Phase 2 begins** — five separate plans (one per bucket) for the per-doc verification work, each producing its own PR. Phase 2 plans are out of scope for this document.

---

## Self-Review

**Spec coverage:** 28-file inventory covered ✓ (Tasks 2-6). 6 READMEs covered ✓ (Task 1). Reference fixing covered ✓ (Task 7 Steps 1-5). Diagrams covered ✓ (Task 3 Step 2). Filename normalization covered ✓ (every `git mv` includes the rename). Spec's deferred-decision flags surfaced in bucket READMEs ✓ (NICE LITE vs full + Assistant Coach Delegation parked status).

**Placeholder scan:** Each step has concrete code blocks or shell commands. The bucket READMEs use real file paths and one-liner descriptions. No "TBD" or "fill in details".

**Type/path consistency:** Filenames in `git mv` commands match the bucket README links match the cross-reference grep patterns in Task 7. Spot-checked.

**Final-task check:** Task 7 is the dedicated source-of-truth doc-update task with literal checkbox steps for `CLAUDE.md`, `docs/README.md`, `docs/audit/README.md`, internal cross-references, and a sanity grep. ✓
