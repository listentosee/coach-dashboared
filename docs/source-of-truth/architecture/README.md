# Architecture

System-shape documentation — how the app is structured. Update or add when the system's architecture changes.

## Files

| File | Purpose | Last verified |
|---|---|---|
| [authentication-standards.md](./authentication-standards.md) | Server, client, middleware auth rules; wrapper layer; service-role policy | ✅ Verified 2026-05-03 against `1c60208a` — no changes |
| [coaches-dashboard-architecture.md](./coaches-dashboard-architecture.md) | Whole-system architecture and component map | ✏️ Updated 2026-05-03 against `1c60208a` — refreshed tech-stack versions, replaced Adobe Sign with Zoho Sign throughout, fixed AuthService import sample, noted Sonner toast pattern, refreshed package-deps block |
| [messaging-architecture.md](./messaging-architecture.md) | Messaging system architecture walkthrough | ✏️ Updated 2026-05-03 against `1c60208a` — added schema-reconciliation banner (archive flow is now message-level only; `conversations.type` not `is_announcement`), patched conversation_members snippet |
| [messaging-interface.md](./messaging-interface.md) | Coach-facing messaging UI specification | ✅ Verified 2026-05-03 against `1c60208a` — no changes (Plan doc; matches production implementation) |
| [messaging-archive-use-cases.md](./messaging-archive-use-cases.md) | Archive behavior — current and proposed use cases | ✏️ Updated 2026-05-03 against `1c60208a` — reframed "Current vs Proposed" to "Prior vs Current"; the proposed design is now production. Fixed the flag SQL (uses `message_user_state.flagged`, not a separate table) and Scenario 2 (conversation archive is derived, not written to `conversation_members.archived_at`). Open follow-up: cleanup of legacy `archived_messages` table |
