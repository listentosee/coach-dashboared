# Per-User Message State Architecture Plan

## Critical Security Issues Identified

### Current Problems
1. **Flags are global**: `messages.flagged` column affects all users
2. **Archives delete for everyone**: Archive functions hard-delete messages from database
3. **No user isolation**: All users see identical message states
4. **FERPA violation**: User actions (flag/archive) affect other users' data
5. **Poor data segmentation**: Personal actions are shared across all conversation members

### What Works Correctly
✅ **Read receipts** - Already per-user in `message_read_receipts` table
✅ **Conversation membership** - Already per-user in `conversation_members` table with `archived_at`

## Proposed Architecture

### 1. User-Specific Message Flags

**Current (BROKEN)**:
```sql
messages
  - flagged BOOLEAN  -- Global for all users!
```

**New (CORRECT)**:
```sql
message_flags
  - id UUID PK
  - user_id UUID FK → auth.users
  - message_id UUID FK → messages
  - flagged_at TIMESTAMPTZ
  - UNIQUE(user_id, message_id)
```

**Benefits**:
- Each user has their own flags
- No impact on other users
- Can query: "which messages has THIS user flagged?"

### 2. Per-User Archive (Soft Delete)

**Current (BROKEN)**:
- `archive_conversation()` **DELETES** messages from database
- Affects ALL users in conversation
- Data loss for other participants

**New (CORRECT)**:

Option A: Per-User Archive Flag (Recommended)
```sql
conversation_members
  - archived_at TIMESTAMPTZ  -- Already exists! ✅

-- New table for per-message archives
message_user_state
  - id UUID PK
  - user_id UUID FK → auth.users
  - message_id UUID FK → messages
  - archived_at TIMESTAMPTZ NULL
  - UNIQUE(user_id, message_id)
```

**Benefits**:
- Soft delete - messages stay in database
- Each user archives independently
- Can restore without affecting others
- Conversation-level archive already works via `conversation_members.archived_at`

### 3. Query Filtering Strategy

All message queries must filter by current user's state:

```sql
-- Get messages for user (excluding archived)
SELECT m.*
FROM messages m
WHERE m.conversation_id = ?
  -- User is member
  AND EXISTS (
    SELECT 1 FROM conversation_members cm
    WHERE cm.conversation_id = m.conversation_id
    AND cm.user_id = auth.uid()
  )
  -- Conversation not archived by user
  AND NOT EXISTS (
    SELECT 1 FROM conversation_members cm
    WHERE cm.conversation_id = m.conversation_id
    AND cm.user_id = auth.uid()
    AND cm.archived_at IS NOT NULL
  )
  -- Message not archived by user
  AND NOT EXISTS (
    SELECT 1 FROM message_user_state mus
    WHERE mus.message_id = m.id
    AND mus.user_id = auth.uid()
    AND mus.archived_at IS NOT NULL
  );

-- Get flagged messages for user
SELECT m.*
FROM messages m
JOIN message_flags mf ON mf.message_id = m.id
WHERE mf.user_id = auth.uid()
  AND EXISTS (...conversation membership check...);
```

## Migration Strategy

### Phase 1: Fix Flags (User-Specific)
1. Create `message_flags` table
2. Migrate existing `messages.flagged = true` to `message_flags` for ALL conversation members
3. Update `toggle_message_flag()` to insert/delete from `message_flags`
4. Update `get_conversation_messages()` to LEFT JOIN `message_flags` for current user
5. Drop `messages.flagged` column

### Phase 2: Fix Archives (Soft Delete)
1. Create `message_user_state` table (for per-message archives)
2. Change `archive_conversation()` to set `conversation_members.archived_at` (already works!)
3. Create new `archive_message_for_user()` that inserts into `message_user_state`
4. Update all queries to filter out archived messages per-user
5. Remove hard-delete archive functions

### Phase 3: Update All Functions
Update these functions to include user-specific filtering:
- `get_conversation_messages()` - Add flagged/archived filtering
- `get_thread_messages()` - Add flagged/archived filtering
- `list_conversations_enriched()` - Already filters by `conversation_members.archived_at` ✅

## Security & Performance

### RLS Policies
```sql
-- message_flags
CREATE POLICY "Users can manage their own flags"
ON message_flags
USING (user_id = auth.uid());

-- message_user_state
CREATE POLICY "Users can manage their own message state"
ON message_user_state
USING (user_id = auth.uid());
```

### Indexes
```sql
CREATE INDEX idx_message_flags_user_message
ON message_flags(user_id, message_id);

CREATE INDEX idx_message_user_state_user_message
ON message_user_state(user_id, message_id);

CREATE INDEX idx_message_user_state_archived
ON message_user_state(user_id, archived_at)
WHERE archived_at IS NOT NULL;
```

## Data Isolation Verification

### Test Scenarios
1. ✅ User A flags message → User B doesn't see flag
2. ✅ User A archives conversation → User B still sees it
3. ✅ User A archives single message → User B still sees it
4. ✅ User A reads message → User B sees it as unread (already works)
5. ✅ Admin can't see user's personal flags/archives (unless in same conversation)

## Implementation Order

1. **STOP using current archive/flag features** (data loss risk)
2. Create `message_flags` table + migration
3. Create `message_user_state` table
4. Update all database functions
5. Update API endpoints
6. Update frontend queries
7. Test data isolation
8. Remove old `messages.flagged` column
9. Remove hard-delete archive functions

## Estimated Effort
- Database migrations: 2-3 hours
- Function updates: 2-3 hours
- API updates: 1-2 hours
- Frontend updates: 1-2 hours
- Testing: 2-3 hours
**Total: ~10-13 hours**

## FERPA Compliance
✅ Per-user flags - no data sharing
✅ Per-user archives - no data deletion for others
✅ Read receipts - already per-user
✅ RLS policies enforce user isolation
