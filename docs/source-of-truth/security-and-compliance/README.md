# Security & Compliance

FERPA audit, data encryption posture, DPA tracking, third-party API compliance.

## Files

| File | Purpose | Last verified |
|---|---|---|
| [ferpa-compliance-audit-2025.md](./ferpa-compliance-audit-2025.md) | FERPA controls inventory and audit findings | ✏️ Updated 2026-05-03 (`c075303a`) — auth-helpers→ssr migration, 7-day token, status-updates section appended; SME review of remediation status still needed |
| [codebase-db-review.md](./codebase-db-review.md) | Static review of the codebase + DB schema | ✏️ Updated 2026-05-03 (`c075303a`) — all 5 findings still hold; line numbers + schema-file path refreshed |
| [metactf-api-compliance-certification.md](./metactf-api-compliance-certification.md) | MetaCTF API compliance attestation | ✏️ Updated 2026-05-03 (`c075303a`) — 9 functional endpoints re-verified; corrected `GET /` row (no client method) |
| [legal/dpa-tracking.md](./legal/dpa-tracking.md) | Data Processing Agreements with sub-processors | ⚠️ Updated 2026-05-03 (`c075303a`) — Monday.com / MetaCTF confirmed active; flagged missing entries for SendGrid + Sentry; legal sign-off + DPA execution remain SME items |
| [legal/database-encryption.md](./legal/database-encryption.md) | Database encryption-at-rest documentation | ⚠️ Updated 2026-05-03 (`c075303a`) — code-level claims (pgcrypto installed, no column-level encryption) confirmed; AWS RDS / KMS platform claims need compliance-officer re-verification |
| [legal/storage-encryption.md](./legal/storage-encryption.md) | Supabase Storage bucket encryption documentation | ⚠️ Updated 2026-05-03 (`c075303a`) — added missing `team-images` + `coach-library` buckets; `temp` bucket not found in code; AWS S3 platform claims need compliance-officer re-verification |
