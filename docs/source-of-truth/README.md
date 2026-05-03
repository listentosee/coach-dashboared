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
