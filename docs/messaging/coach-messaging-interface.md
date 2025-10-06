# Coach Messaging Interface Plan

## Objective
- Deliver a stand-alone coach-focused messaging module with an email-client style two-column layout.
- Ensure the module relies only on existing messaging database entities and API endpoints, avoiding admin UI dependencies.

## Guiding Principles
- Preserve clear separation from the admin experience; avoid shared stateful UI logic until explicitly aligned.
- Build virtual thread groupings in the client so message data remains the single source of truth.
- Keep list interactions passive—users should explicitly select what to read or act on.
- Design components for reuse across future coach messaging surfaces (e.g., mobile, embedded widgets).
- Render inbox rows directly from the message dataset; conversation records exist only for metadata such as unread counts.
- Mirror the admin console’s realtime architecture by subscribing to Supabase channels for conversations, messages, and read receipts.

## Module Architecture
- `CoachMessagingShell` – overall container orchestrating data fetches, layout, and global state (filters, selection, thread/message mode). Also owns Supabase realtime subscription lifecycles (conversation-level and thread-level channels).
- `InboxPane`
  - `InboxActionBar` – filter multi-select, unread toggle, send menu.
  - `InboxList`
    - `InboxConversationRow` – renders latest activity, avatar/icon, unread badge.
    - `ThreadGroup` – expandable grouping of thread messages; hides toggle when only one message.
    - `MessageListItem` – individual message rows with avatar initials, unread state.
- `ReaderPane`
  - `ReaderHeader` – action buttons (reply, forward, etc.) and thread metadata.
  - `MessageViewer` – Markdown rendering, read receipts, attachments.
- `ComposerModal` – DM/group dispatcher with option to set subject when sending from the list.
- `useCoachMessagingData` hook – abstracts fetching conversations, messages, read receipts, and directory info; exposes helpers for grouping and filtering; manages subscriptions to:
  - `coach-msgs-${conversationId}` (new message inserts)
  - `coach-thread-${conversationId}-${threadId}` (thread replies)
  - `coach-receipts-${conversationId}-${threadId}` (per-thread receipt inserts)
  - `receipts-self-${userId}` (global receipt updates for the signed-in coach)
- `useCoachComposer` hook – orchestrates DM/group/reply/forward flows and issues Supabase-backed API calls (`/api/messaging/conversations/*`, `/api/messaging/read-receipts`).

### API & RPC Usage
- `GET /api/messaging/conversations`, `/threads`, `/threads/:rootId` – primary data source.
- `POST /api/messaging/conversations/:id/messages` – send/reply/forward messages (calls `insert_message` RPC server-side).
- `POST /api/messaging/conversations/dm|group` – create conversations prior to sending.
- `POST /api/messaging/conversations/:id/read` – mark conversation read (updates `conversation_members.last_read_at`).
- `POST /api/messaging/read-receipts` → `mark_messages_read` RPC – invoked when leaving a message/thread.
- `GET /api/messaging/read-receipts` → `get_message_read_status` RPC – populate reader roster.

## Data & State Strategy
- Fetch all coach-accessible messages sorted descending; cache per-conversation message arrays for quick regrouping.
- Derive virtual threads client-side by grouping messages on `parent_message_id` (root self when null).
- Track expanded thread state separately from message selection to keep expansion passive.
- Maintain unread counts using message metadata; for announcements, filter counts to only messages involving the current coach.
- Memoize user display names and avatar colors for consistent rendering.
- Expose flattened thread/message collections so the inbox can mount without legacy conversation scaffolding; each row is derived from message data.
- Persist incoming realtime updates by fusing Supabase change feeds with local state so unread badges and message lists stay in sync without full-page refreshes.

## Development Blocks
1. **Foundations & Hooks**
   - [x] Create `useCoachMessagingData` with conversation/message loaders, grouping utilities, and read-status helpers.
     - Files: `lib/coach-messaging/use-coach-messaging-data.ts`, `lib/coach-messaging/index.ts`
   - [x] Set up shared TypeScript types for conversations, messages, and derived thread groups.
     - Files: `lib/coach-messaging/types.ts`
   - [x] Implement palette + initials helper utilities.
     - Files: `lib/coach-messaging/utils.ts`, `lib/coach-messaging/mock-data.ts`
   - [x] Exit criteria: hook returns seeded mock data (if API unavailable) with tests covering grouping and counts.
     - Files: `tests/coach-messaging-utils.test.js`
   - Notes: Hook bootstraps from mock snapshot with refresh fallback; virtual thread grouping verified via `node --test`.

2. **Inbox Pane**
   - [x] Build `InboxActionBar` with multi-select filter dropdown, unread toggle, and send menu skeleton.
     - Files: `components/coach-messaging/inbox-action-bar.tsx`
   - [x] Implement `InboxConversationRow`, `ThreadGroup`, and `MessageListItem` components using mock data.
     - Files: `components/coach-messaging/inbox-conversation-row.tsx`, `components/coach-messaging/thread-group.tsx`, `components/coach-messaging/message-list-item.tsx`
   - [x] Integrate thread vs. message list modes; ensure expand/collapse does not change selection.
     - Files: `components/coach-messaging/inbox-pane.tsx`, `components/coach-messaging/index.ts`
   - [x] Exit criteria: Storybook or local story renders showing interactions with mocked handlers.
     - Files: `components/coach-messaging/inbox-pane.tsx`
   - Notes: Inbox pane runs against `useCoachMessagingData` mock snapshot, preserves passive thread toggles, exposes selection callbacks for the reader pane, renders inbox rows directly from message data (no legacy conversation shell), and maintains local unread state sourced from message IDs for deterministic badges.

3. **Reader Pane**
   - [x] Create `ReaderHeader` and `MessageViewer` components.
     - Files: `components/coach-messaging/reader-header.tsx`, `components/coach-messaging/message-viewer.tsx`
   - [x] Wire selection behavior from the inbox; ensure no auto-selection on load.
     - Files: `components/coach-messaging/inbox-pane.tsx`, `components/coach-messaging/coach-messaging-workspace.tsx`, `app/dashboard/messages-v2/page.tsx`, `components/coach-messaging/index.ts`
   - [x] Implement read roster toggle (seen vs. unseen) scoped to allowed viewers.
     - Files: `components/coach-messaging/reader-pane.tsx`
   - [x] Exit criteria: Manual QA walkthrough with mocked selection verifying UI contract.
     - Files: `components/coach-messaging/reader-pane.tsx`
   - Notes: Reader pane consumes inbox selection, displays thread metadata, maintains unread consistency when the reader focus changes, and router now mounts the new workspace for coach role testing.

4. **Composer & Actions**
   - [x] Implement `ComposerModal` with DM/group send flows, attachment uploads, and optional subject field.
     - Files: `components/coach-messaging/composer-modal.tsx`, `lib/coach-messaging/use-coach-composer.ts`
   - [x] Add Reply/Forward actions in the reader header respecting current selection.
     - Files: `components/coach-messaging/coach-messaging-workspace.tsx`, `components/coach-messaging/reader-pane.tsx`
   - [x] Exit criteria: UI paths exercised via mock snapshot; composer updates local message state and unread counts to keep workspace consistent.
     - Files: `components/coach-messaging/coach-messaging-workspace.tsx`, `lib/coach-messaging/types.ts`
   - Notes: Composer controller encapsulates state transitions (DM, group, reply, forward) and now relies on live Supabase endpoints plus realtime refreshes; reply/forward buttons launch the composer with contextual defaults while maintaining the message-first architecture and marking messages read on leave.

5. **Integration & Polish**
   - [x] Wire the coach workspace to live Supabase data sources, including realtime subscriptions, read receipts, and unread badge updates.
     - Files: `components/coach-messaging/coach-messaging-workspace.tsx`, `lib/coach-messaging/use-coach-messaging-data.ts`, `app/dashboard/layout.tsx`
   - [x] Ensure list sorting, filters, and dropdown ergonomics match production expectations (descending threads/messages, opaque filter menus, responsive layout fixes).
     - Files: `components/coach-messaging/inbox-pane.tsx`, `components/coach-messaging/inbox-action-bar.tsx`
   - [x] Stabilize read state by hydrating from `message_read_receipts`, auto-marking coach-sent messages, and minimizing redundant refreshes.
     - Files: `components/coach-messaging/coach-messaging-workspace.tsx`, `lib/coach-messaging/use-coach-messaging-data.ts`, `app/api/messaging/read-receipts/route.ts`
   - [x] Exit criteria: Real data round-trips maintain unread counts, menu badge, and message ordering without excessive API chatter.
     - Files: `components/coach-messaging/coach-messaging-workspace.tsx`, `app/dashboard/layout.tsx`
   - Notes: Integration completed; ongoing work shifts to regression coverage and staged rollout.
## Deployment & Assessment Gates
- After each block, open a PR with feature flags or behind a route guard to allow incremental review.
- Maintain a tracking checklist to confirm requirements, including thread behavior, announcement counts, and passive expansion.
- Run lint/tests per PR; add targeted Playwright tests once the shell is integrated.
- Stage rollout via coach-only feature flag; gather pilot feedback before broad release.

## Open Questions / Next Steps
- Confirm available messaging API endpoints for coach context (read receipts, thread fetch limits).
- Decide whether announcements should aggregate across organizations or stay coach-specific.
- Determine long-term plan for reusing components in admin interface to avoid drift.
- When approved, begin Block 1 implementation using this plan as the baseline.

## Recent Architectural Adjustments

- **Identifier handling**: All coach messaging models, hooks, and components now treat message and thread IDs as strings. This prevents JavaScript from truncating Postgres `bigint` identifiers once they exceed the safe integer range, which previously caused read-receipt writes to fail silently.
- **API normalization**: Messaging endpoints (`/api/messaging/conversations/*`, `/api/messaging/threads/*`, `/api/messaging/read-receipts`) coerce incoming IDs to strings, validate them, and only pass clean values to Supabase RPCs. This ensures parity between the coach UI and database operations regardless of transport type.
- **Error surfacing**: The read-receipt client handler now inspects the response from the API call and logs any failures so regressions are observable during QA instead of being masked by cached state.

These changes were driven by pilot feedback noting that unread indicators cleared in the UI but were not persisted server-side. The root cause was loss of precision when large message IDs were represented as numbers in client state. Normalizing the ID model and API contract resolves the data integrity gap without impacting the legacy admin console, which already handled IDs as strings.

- **Coach identity lookup**: The workspace now derives the current coach’s UUID from Supabase auth rather than relying on seeded mock IDs, ensuring read receipts and sender comparisons are accurate in multi-user environments.
- **Unread badge coordination**: All read/write flows dispatch a shared `unread-refresh` event and reuse a single `refreshUnread` callback so the sidebar counter stays in sync without redundant network calls.
- **Thread hydration**: Snapshot loading batches calls to `/api/messaging/read-receipts`, enriching message caches with persisted read timestamps. This removes the need for the admin-only receipt RPCs referenced earlier and supersedes earlier mock-driven assumptions about read state.
