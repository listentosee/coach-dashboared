# Message Archive Use Cases — Historical "Broken vs Fixed" Comparison

> **Status (2026-05-03):** This document was authored when the messaging archive flow was being redesigned. The "Proposed Implementation (CORRECT)" sections below describe the **current production behavior**: per-user archive/flag state lives in `message_user_state`, no hard deletes, conversation-level archive is *derived* from message state. The "Current Implementation (BROKEN)" sections describe the prior design (hard-deleting messages, global flag column, conversation-level `archived_at` write path) — kept as a regression-prevention reference. Read every "Current Implementation" section as historical context, and every "Proposed Implementation" section as how the system actually behaves today.
>
> Implementation lives in: `supabase/migrations/20260206000001_simplify_archive_to_message_level.sql`, `supabase/migrations/20260206000002_add_archive_state_to_summary.sql`, and the `list_conversations_enriched` / `list_conversations_summary` RPCs.

## Scenario 1: User Archives a Single Message

### Prior (BROKEN) Implementation — replaced

**Setup:**
- Conversation: "Team Planning"
- Members: Alice (Coach), Bob (Coach), Charlie (Coach)
- Messages:
  1. Alice: "What time is practice?" (id: msg-1)
  2. Bob: "3pm works for me" (id: msg-2)
  3. Charlie: "I can't make it" (id: msg-3)
  4. Alice: "Let's move to 4pm" (id: msg-4)

**Action:** Alice archives msg-3 (Charlie's message)

**What Happens:**
```sql
-- archive_message(msg-3) does:
1. Store in archived_messages:
   {
     "type": "message",
     "message": { id: msg-3, body: "I can't make it", ... }
   }

2. DELETE FROM messages WHERE id = msg-3;  -- HARD DELETE!
```

**Result:**
- ❌ Message deleted from database
- ❌ Bob and Charlie ALSO lose the message
- ❌ Conversation now shows: msg-1, msg-2, ~~msg-3~~, msg-4
- ❌ Bob sees: "What time? / 3pm works / Let's move to 4pm" (context lost!)
- ❌ If Alice restores: Creates new msg-3 with new UUID (breaks threading)

**Problems:**
1. Hard delete affects ALL users
2. Restore creates duplicate/orphan records
3. Thread integrity broken
4. FERPA violation (Alice deleted Charlie's data)

---

### Current (CORRECT) Implementation

**Same Setup**

**Action:** Alice archives msg-3

**What Happens:**
```sql
-- archive_message_for_user(msg-3) does:
INSERT INTO message_user_state (user_id, message_id, archived_at)
VALUES (alice_id, msg-3, NOW());
-- NO DELETE - message stays in database!
```

**Result:**
- ✅ Message stays in database
- ✅ Alice's query filters it out (doesn't see msg-3)
- ✅ Bob sees all 4 messages normally
- ✅ Charlie sees all 4 messages normally
- ✅ Alice can unarchive: just DELETE FROM message_user_state

**Query for Alice:**
```sql
SELECT m.* FROM messages m
WHERE conversation_id = 'Team Planning'
  AND NOT EXISTS (
    SELECT 1 FROM message_user_state mus
    WHERE mus.message_id = m.id
      AND mus.user_id = alice_id
      AND mus.archived_at IS NOT NULL
  )
-- Returns: msg-1, msg-2, msg-4 (msg-3 hidden for Alice only)
```

---

## Scenario 2: User Archives Entire Conversation

### Prior (BROKEN) Implementation — replaced

**Setup:**
- Conversation: "Old Project Discussion"
- Members: Alice, Bob, Charlie
- Messages: 50 messages total

**Action:** Alice archives the conversation

**What Happens:**
```sql
-- archive_conversation_v2() does:
1. Store in archived_messages:
   {
     "type": "conversation",
     "conversation": { id: conv-1, title: "Old Project", ... },
     "messages": [ ...all 50 messages... ]
   }

2. DELETE FROM messages WHERE conversation_id = conv-1;  -- DELETES ALL!
3. DELETE FROM conversations WHERE id = conv-1;  -- DELETES CONVERSATION!
```

**Result:**
- ❌ Entire conversation deleted from database
- ❌ Bob and Charlie LOSE ALL 50 MESSAGES
- ❌ Bob/Charlie can't access conversation anymore
- ❌ If Alice restores: Creates duplicate conversation + messages (new UUIDs)
- ❌ Massive data loss for other users

---

### Current (CORRECT) Implementation

**Same Setup**

**Action:** Alice archives the conversation

**What Happens (current production behavior):**

Conversation-level archive is now *derived* from message-level state — there is no separate `archive_conversation_for_user()` write path. Archiving "the conversation" means archiving every message in it (`message_user_state.archived_at` set per message). The `list_conversations_enriched` and `list_conversations_summary` RPCs compute `all_archived = true` for the user iff every message has `archived_at` set, and a new message landing in the conversation flips that bit back to `false` automatically — no trigger needed.

```sql
-- The 'archive whole conversation' UI action expands to a per-message
-- archive write, e.g.:
INSERT INTO message_user_state (user_id, message_id, archived_at)
SELECT alice_id, m.id, NOW()
FROM messages m
WHERE m.conversation_id = conv-1
ON CONFLICT (user_id, message_id) DO UPDATE SET archived_at = EXCLUDED.archived_at;

-- (Note: conversation_members.archived_at still exists in the schema
--  as a legacy column but is not the active archive write target.)
```

**Result:**
- ✅ Conversation and messages stay in database
- ✅ Alice doesn't see conversation in her inbox
- ✅ Bob sees conversation normally with all 50 messages
- ✅ Charlie sees conversation normally with all 50 messages
- ✅ Alice can unarchive: UPDATE archived_at = NULL

**Query for Alice:**
```sql
-- Conversations where 'all messages archived' for Alice are excluded
-- via the all_archived flag returned by list_conversations_enriched
-- / list_conversations_summary.
SELECT * FROM list_conversations_enriched(alice_id)
WHERE all_archived = false;
-- "Old Project Discussion" not returned
```

---

## Scenario 3: Flag a Message

### Prior (BROKEN) Implementation — replaced

**Setup:**
- Conversation with messages msg-1, msg-2, msg-3
- Members: Alice, Bob

**Action:** Alice flags msg-2

**What Happens:**
```sql
UPDATE messages SET flagged = true WHERE id = msg-2;
```

**Result:**
- ❌ Bob ALSO sees msg-2 as flagged
- ❌ Bob's "Flagged" filter shows msg-2 (but he didn't flag it!)
- ❌ If Bob unflags it, Alice loses her flag

---

### Current (CORRECT) Implementation

**Same Setup**

**Action:** Alice flags msg-2

**What Happens:**
```sql
-- The flag lives on message_user_state alongside archived_at —
-- there is no separate message_flags table.
INSERT INTO message_user_state (user_id, message_id, flagged)
VALUES (alice_id, 'msg-2', true)
ON CONFLICT (user_id, message_id) DO UPDATE SET flagged = true;
```

**Result:**
- ✅ Only Alice sees msg-2 as flagged
- ✅ Bob sees msg-2 as not flagged
- ✅ Alice's "Flagged" filter shows msg-2
- ✅ Bob's "Flagged" filter doesn't show msg-2

---

## Scenario 4: Restore Archived Message (Current = DISASTER)

**Setup:**
- Alice archived msg-3 (which hard-deleted it)
- archived_messages contains: `{"type": "message", "message": {...}}`

**Action:** Alice clicks "Restore"

**What Happens:**
```sql
-- restore_archived_item() does:
v_message := v_archive_data->'message';

INSERT INTO messages (id, conversation_id, sender_id, body, ...)
VALUES (
  (v_message->>'id')::UUID,  -- Original UUID
  ...
);
```

**Problems:**
1. If someone else already restored it → Unique constraint violation (duplicate UUID)
2. If conversation was also archived/deleted → FK violation
3. Thread relationships broken (parent_message_id may not exist)
4. Read receipts lost
5. Created_at timestamp is NOW(), not original time

---

## Scenario 5: Multiple Users Archive Same Message

### Prior Implementation — replaced

**Setup:**
- Conversation with msg-1, msg-2, msg-3
- Members: Alice, Bob, Charlie

**Actions:**
1. Alice archives msg-2 → **DELETES msg-2 from database**
2. Bob tries to archive msg-2 → **ERROR: Message not found**

**Result:**
- ❌ Bob can't archive what Alice already deleted
- ❌ Charlie lost access to msg-2 (didn't even archive it!)

---

### Current Implementation

**Same Setup**

**Actions:**
1. Alice archives msg-2 → `INSERT INTO message_user_state (alice_id, msg-2, NOW())`
2. Bob archives msg-2 → `INSERT INTO message_user_state (bob_id, msg-2, NOW())`

**Result:**
- ✅ Alice doesn't see msg-2
- ✅ Bob doesn't see msg-2
- ✅ Charlie still sees msg-2 (didn't archive it)
- ✅ Each can unarchive independently

---

## Implemented Data Structure

```sql
-- User-specific message state (flags, archives)
CREATE TABLE message_user_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  flagged BOOLEAN DEFAULT FALSE,
  archived_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, message_id)
);

-- Indexes
CREATE INDEX idx_message_user_state_user ON message_user_state(user_id);
CREATE INDEX idx_message_user_state_flagged ON message_user_state(user_id, flagged) WHERE flagged = true;
CREATE INDEX idx_message_user_state_archived ON message_user_state(user_id, archived_at) WHERE archived_at IS NOT NULL;
```

## Key Functions

### Get Messages (Per-User Filtered)
```sql
CREATE FUNCTION get_conversation_messages_for_user(p_conversation_id UUID, p_user_id UUID)
RETURNS TABLE(...) AS $$
  SELECT
    m.*,
    COALESCE(mus.flagged, false) as flagged,
    mus.archived_at
  FROM messages m
  LEFT JOIN message_user_state mus ON (
    mus.message_id = m.id AND mus.user_id = p_user_id
  )
  WHERE m.conversation_id = p_conversation_id
    -- Conversation not archived by user
    AND NOT EXISTS (
      SELECT 1 FROM conversation_members cm
      WHERE cm.conversation_id = p_conversation_id
        AND cm.user_id = p_user_id
        AND cm.archived_at IS NOT NULL
    )
    -- Message not archived by user
    AND (mus.archived_at IS NULL OR mus.archived_at IS NULL)
  ORDER BY m.created_at;
$$;
```

### Toggle Flag
```sql
CREATE FUNCTION toggle_message_flag(p_message_id UUID, p_flagged BOOLEAN)
RETURNS VOID AS $$
  INSERT INTO message_user_state (user_id, message_id, flagged)
  VALUES (auth.uid(), p_message_id, p_flagged)
  ON CONFLICT (user_id, message_id)
  DO UPDATE SET flagged = p_flagged, updated_at = NOW();
$$;
```

### Archive Message
```sql
CREATE FUNCTION archive_message_for_user(p_message_id UUID)
RETURNS VOID AS $$
  INSERT INTO message_user_state (user_id, message_id, archived_at)
  VALUES (auth.uid(), p_message_id, NOW())
  ON CONFLICT (user_id, message_id)
  DO UPDATE SET archived_at = NOW(), updated_at = NOW();
$$;
```

### Unarchive Message
```sql
CREATE FUNCTION unarchive_message_for_user(p_message_id UUID)
RETURNS VOID AS $$
  UPDATE message_user_state
  SET archived_at = NULL, updated_at = NOW()
  WHERE user_id = auth.uid() AND message_id = p_message_id;
$$;
```

### Archive Conversation
The conversation-level archive write is now implemented as a bulk per-message archive (see Scenario 2 above). The legacy `conversation_members.archived_at` column is retained but is not written to by the active archive flow.

## Data Isolation Guarantees

1. ✅ **Flags**: Each user's flags are completely independent
2. ✅ **Archives**: Archiving only hides messages for that user
3. ✅ **No Hard Deletes**: Messages never deleted from database
4. ✅ **No Restore Issues**: Nothing to restore - just toggle visibility
5. ✅ **Thread Integrity**: Parent/child relationships always maintained
6. ✅ **FERPA Compliant**: User actions don't affect other users' data

## Migration Path (historical — complete)

1. ✅ Stop using prior archive functions
2. ✅ Created `message_user_state` table
3. ✅ Migrated to `message_user_state.flagged`
4. ✅ Updated all query functions (`list_conversations_enriched`, `list_conversations_summary`)
5. ⚠️ `archived_messages` table still present in the schema as a legacy carry-over (write path no longer used)
6. ✅ `messages.flagged` column dropped from the `messages` table; flag state now owned by `message_user_state.flagged`
7. ✅ Cross-user isolation verified

---

**Last verified:** 2026-05-03 against commit `1c60208a`.
**Notes:** Reframed the doc from "Current vs Proposed" to "Prior (BROKEN) vs Current (CORRECT)" — the proposed design is now production behavior. Added a status banner at the top, updated headings throughout, fixed Scenario 2 to reflect that conversation-level archive is now derived from message-level state (not a `conversation_members.archived_at` write), corrected the flag SQL to use `message_user_state.flagged` (not a `message_flags` table), retitled "Proposed Data Structure" to "Implemented Data Structure", removed the obsolete `archive_conversation_for_user` function sample, and converted the Migration Path checklist to a completion log. Confirmed via `data/db_schema_20260208.sql` that `messages.flagged` is no longer a column on the `messages` table — `flagged` is owned exclusively by `message_user_state` and surfaced in RPC return tables. Open follow-up: legacy `archived_messages` table and `conversation_members.archived_at` column still exist in the schema with no active write path — worth a separate cleanup PR.
