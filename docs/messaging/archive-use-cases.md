# Message Archive Use Cases - Current vs. Proposed

## Scenario 1: User Archives a Single Message

### Current Implementation (BROKEN)

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

### Proposed Implementation (CORRECT)

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

### Current Implementation (BROKEN)

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

### Proposed Implementation (CORRECT)

**Same Setup**

**Action:** Alice archives the conversation

**What Happens:**
```sql
-- archive_conversation_for_user() does:
UPDATE conversation_members
SET archived_at = NOW()
WHERE conversation_id = conv-1 AND user_id = alice_id;
-- NO DELETES - everything stays!
```

**Result:**
- ✅ Conversation and messages stay in database
- ✅ Alice doesn't see conversation in her inbox
- ✅ Bob sees conversation normally with all 50 messages
- ✅ Charlie sees conversation normally with all 50 messages
- ✅ Alice can unarchive: UPDATE archived_at = NULL

**Query for Alice:**
```sql
SELECT c.* FROM conversations c
JOIN conversation_members cm ON cm.conversation_id = c.id
WHERE cm.user_id = alice_id
  AND cm.archived_at IS NULL  -- Filter out archived
-- "Old Project Discussion" not returned
```

---

## Scenario 3: Flag a Message

### Current Implementation (BROKEN)

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

### Proposed Implementation (CORRECT)

**Same Setup**

**Action:** Alice flags msg-2

**What Happens:**
```sql
INSERT INTO message_flags (user_id, message_id, flagged_at)
VALUES (alice_id, msg-2, NOW());
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

### Current Implementation

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

### Proposed Implementation

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

## Proposed Data Structure

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
```sql
CREATE FUNCTION archive_conversation_for_user(p_conversation_id UUID)
RETURNS VOID AS $$
  UPDATE conversation_members
  SET archived_at = NOW()
  WHERE conversation_id = p_conversation_id AND user_id = auth.uid();
$$;
```

## Data Isolation Guarantees

1. ✅ **Flags**: Each user's flags are completely independent
2. ✅ **Archives**: Archiving only hides messages for that user
3. ✅ **No Hard Deletes**: Messages never deleted from database
4. ✅ **No Restore Issues**: Nothing to restore - just toggle visibility
5. ✅ **Thread Integrity**: Parent/child relationships always maintained
6. ✅ **FERPA Compliant**: User actions don't affect other users' data

## Migration Path

1. Stop using current archive functions (disable feature)
2. Create `message_user_state` table
3. Migrate existing `messages.flagged` → `message_user_state.flagged` for all users
4. Update all query functions
5. Remove `archived_messages` table (broken design)
6. Drop `messages.flagged` column
7. Test isolation between users
