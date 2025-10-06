# Complete Messaging Architecture - Use Case Walkthrough

## Database Tables

```sql
-- Core message data (shared by all users)
messages (
  id UUID,
  conversation_id UUID,
  sender_id UUID,
  body TEXT,
  created_at TIMESTAMPTZ
)

-- Per-user personal state (flags, archives)
message_user_state (
  id UUID,
  user_id UUID,           -- Who owns this state
  message_id UUID,        -- Which message
  flagged BOOLEAN,        -- Has this user flagged it?
  archived_at TIMESTAMPTZ -- Has this user archived it?
)

-- Who's in what conversation
conversation_members (
  conversation_id UUID,
  user_id UUID,
  archived_at TIMESTAMPTZ  -- Has this user archived the ENTIRE conversation?
)

-- Read tracking (already works correctly)
message_read_receipts (
  message_id UUID,
  user_id UUID,
  read_at TIMESTAMPTZ
)
```

---

## Use Case 1: Alice Sends a Message to Bob

### Step 1: Alice composes message
**Action:** Alice types "Can you review the training plan?" and clicks Send

**Backend:**
```sql
INSERT INTO messages (id, conversation_id, sender_id, body, created_at)
VALUES (
  'msg-001',
  'conv-alice-bob',
  'alice-id',
  'Can you review the training plan?',
  '2025-01-10 10:00:00'
);
```

**Database State:**
```
messages:
  msg-001 | conv-alice-bob | alice-id | "Can you review..." | 2025-01-10 10:00

message_user_state:
  (empty - no one has flagged/archived yet)

conversation_members:
  conv-alice-bob | alice-id | NULL (not archived)
  conv-alice-bob | bob-id   | NULL (not archived)
```

### Step 2: Alice's inbox view
**Query:** Get messages for Alice
```sql
SELECT m.*,
  COALESCE(mus.flagged, false) as flagged,
  mus.archived_at as archived_at
FROM messages m
LEFT JOIN message_user_state mus ON (
  mus.message_id = m.id AND mus.user_id = 'alice-id'
)
WHERE m.conversation_id = 'conv-alice-bob'
  AND NOT EXISTS (
    SELECT 1 FROM conversation_members cm
    WHERE cm.conversation_id = m.conversation_id
      AND cm.user_id = 'alice-id'
      AND cm.archived_at IS NOT NULL
  )
  AND (mus.archived_at IS NULL OR mus.id IS NULL);
```

**Alice sees:**
```
msg-001 | "Can you review..." | flagged: false | archived: false
```

### Step 3: Bob's inbox view
**Query:** Get messages for Bob
```sql
-- Same query, but user_id = 'bob-id'
```

**Bob sees:**
```
msg-001 | "Can you review..." | flagged: false | archived: false
```

**Result:** ✅ Both users see the same message with independent state

---

## Use Case 2: Bob Flags the Message

### Action: Bob clicks the flag icon on msg-001

**Backend:**
```sql
INSERT INTO message_user_state (user_id, message_id, flagged, archived_at)
VALUES ('bob-id', 'msg-001', true, NULL)
ON CONFLICT (user_id, message_id)
DO UPDATE SET flagged = true;
```

**Database State:**
```
message_user_state:
  1 | bob-id | msg-001 | flagged: true | archived_at: NULL
```

### Bob's view after flagging
**Query:** (same query as before)

**Bob sees:**
```
msg-001 | "Can you review..." | flagged: TRUE | archived: false
```

### Alice's view (unchanged)
**Alice sees:**
```
msg-001 | "Can you review..." | flagged: false | archived: false
```

**Result:** ✅ Bob's flag is private to Bob. Alice doesn't see it.

---

## Use Case 3: Alice Archives the Message

### Action: Alice clicks archive on msg-001

**Backend:**
```sql
INSERT INTO message_user_state (user_id, message_id, flagged, archived_at)
VALUES ('alice-id', 'msg-001', false, NOW())
ON CONFLICT (user_id, message_id)
DO UPDATE SET archived_at = NOW();
```

**Database State:**
```
messages:
  msg-001 | conv-alice-bob | alice-id | "Can you review..." | 2025-01-10 10:00
  ☝️ MESSAGE STAYS IN DATABASE - NOT DELETED

message_user_state:
  1 | bob-id   | msg-001 | flagged: true  | archived_at: NULL
  2 | alice-id | msg-001 | flagged: false | archived_at: 2025-01-10 14:30
```

### Alice's view after archiving
**Query:** (same query with archived_at filter)

**Alice sees:**
```
(empty - msg-001 is hidden because mus.archived_at IS NOT NULL)
```

### Bob's view (unchanged)
**Bob sees:**
```
msg-001 | "Can you review..." | flagged: TRUE | archived: false
☝️ BOB STILL SEES THE MESSAGE
```

**Result:** ✅ Alice archived it (hidden for her), Bob still sees it

---

## Use Case 4: Bob Replies to the Message Alice Archived

### Action: Bob replies to msg-001 with "Sure, I'll review it today"

**Backend:**
```sql
INSERT INTO messages (id, conversation_id, sender_id, body, parent_message_id, created_at)
VALUES (
  'msg-002',
  'conv-alice-bob',
  'bob-id',
  'Sure, I''ll review it today',
  'msg-001',  -- Reply to Alice's message
  '2025-01-10 14:35:00'
);
```

**Database State:**
```
messages:
  msg-001 | conv-alice-bob | alice-id | "Can you review..." | parent: NULL    | 10:00
  msg-002 | conv-alice-bob | bob-id   | "Sure, I'll..."     | parent: msg-001 | 14:35
```

### Alice's view
**Alice sees:**
```
msg-002 | "Sure, I'll review..." | flagged: false | archived: false
☝️ ALICE SEES THE NEW MESSAGE (she didn't archive msg-002, only msg-001)
```

### Bob's view
**Bob sees:**
```
msg-001 | "Can you review..." | flagged: true  | archived: false
msg-002 | "Sure, I'll..."     | flagged: false | archived: false
```

**Result:** ✅ Conversation continues normally. Alice's archive only affected HER view of msg-001.

---

## Use Case 5: Alice Unarchives msg-001

### Action: Alice goes to "Archived" view and clicks "Restore" on msg-001

**Backend:**
```sql
UPDATE message_user_state
SET archived_at = NULL
WHERE user_id = 'alice-id' AND message_id = 'msg-001';
```

**Database State:**
```
message_user_state:
  1 | bob-id   | msg-001 | flagged: true  | archived_at: NULL
  2 | alice-id | msg-001 | flagged: false | archived_at: NULL ✅ Changed
```

### Alice's view after unarchiving
**Alice sees:**
```
msg-001 | "Can you review..." | flagged: false | archived: false ✅ Back!
msg-002 | "Sure, I'll..."     | flagged: false | archived: false
```

**Result:** ✅ No database restore needed. Just toggle archived_at to NULL. Thread intact.

---

## Use Case 6: Group Conversation - Multiple Users, Different Actions

### Setup: Group with Alice, Bob, Charlie
**Conversation:** "Team Meeting Notes"
```
messages:
  msg-101 | team-conv | alice-id   | "Meeting at 3pm"
  msg-102 | team-conv | bob-id     | "I can make it"
  msg-103 | team-conv | charlie-id | "I'll be late"
  msg-104 | team-conv | alice-id   | "No problem"
```

### Actions:
1. **Alice flags msg-103** (Charlie's message)
2. **Bob archives msg-102** (his own message)
3. **Charlie archives the entire conversation**

**Backend:**
```sql
-- Alice flags msg-103
INSERT INTO message_user_state (user_id, message_id, flagged)
VALUES ('alice-id', 'msg-103', true);

-- Bob archives msg-102
INSERT INTO message_user_state (user_id, message_id, archived_at)
VALUES ('bob-id', 'msg-102', NOW());

-- Charlie archives entire conversation
UPDATE conversation_members
SET archived_at = NOW()
WHERE conversation_id = 'team-conv' AND user_id = 'charlie-id';
```

**Database State:**
```
message_user_state:
  1 | alice-id | msg-103 | flagged: true  | archived_at: NULL
  2 | bob-id   | msg-102 | flagged: false | archived_at: 2025-01-10 15:00

conversation_members:
  team-conv | alice-id   | archived_at: NULL
  team-conv | bob-id     | archived_at: NULL
  team-conv | charlie-id | archived_at: 2025-01-10 15:00 ✅
```

### Alice's view:
```sql
-- Query filters: user_id = alice-id, conversation not archived, messages not archived
```
**Alice sees:**
```
msg-101 | "Meeting at 3pm"  | flagged: false
msg-102 | "I can make it"   | flagged: false
msg-103 | "I'll be late"    | flagged: TRUE ✅ (only Alice sees this flag)
msg-104 | "No problem"      | flagged: false
```

### Bob's view:
```sql
-- Query filters: user_id = bob-id, conversation not archived, messages not archived
```
**Bob sees:**
```
msg-101 | "Meeting at 3pm"  | flagged: false
(msg-102 is HIDDEN - Bob archived it)
msg-103 | "I'll be late"    | flagged: false
msg-104 | "No problem"      | flagged: false
```

### Charlie's view:
```sql
-- Query filters: user_id = charlie-id, conversation not archived
-- BUT conversation_members.archived_at IS NOT NULL for Charlie!
```
**Charlie sees:**
```
(empty - entire conversation is archived for Charlie)
```

**Result:** ✅ Three users, three completely different views. Zero interference.

---

## Use Case 7: Viewing Archived Items

### Alice clicks "Archived" button

**Query:**
```sql
-- Get conversations archived by Alice
SELECT c.*
FROM conversations c
JOIN conversation_members cm ON cm.conversation_id = c.id
WHERE cm.user_id = 'alice-id'
  AND cm.archived_at IS NOT NULL;

-- Get individual messages archived by Alice
SELECT m.*
FROM messages m
JOIN message_user_state mus ON mus.message_id = m.id
WHERE mus.user_id = 'alice-id'
  AND mus.archived_at IS NOT NULL;
```

**Alice sees:**
```
Archived Conversations: (none)
Archived Messages:
  - (none currently)
```

**Charlie sees:**
```
Archived Conversations:
  - "Team Meeting Notes" (archived 2025-01-10 15:00)
Archived Messages: (none)
```

**Result:** ✅ Each user has their own archive view

---

## Use Case 8: Search for Flagged Messages

### Bob clicks "Flagged" filter

**Query:**
```sql
SELECT m.*, c.title as conversation_title
FROM messages m
JOIN message_user_state mus ON (
  mus.message_id = m.id AND mus.user_id = 'bob-id'
)
JOIN conversations c ON c.id = m.conversation_id
WHERE mus.flagged = true
  AND NOT EXISTS (
    SELECT 1 FROM conversation_members cm
    WHERE cm.conversation_id = m.conversation_id
      AND cm.user_id = 'bob-id'
      AND cm.archived_at IS NOT NULL
  )
  AND mus.archived_at IS NULL;
```

**Bob sees:**
```
Flagged Messages:
  - msg-001 | "Can you review the training plan?" | Conversation: Alice & Bob
```

**Alice sees:**
```
Flagged Messages:
  - msg-103 | "I'll be late" | Conversation: Team Meeting Notes
```

**Result:** ✅ Each user sees only THEIR flagged messages

---

## Summary: Complete Data Flow

### When a message is sent:
1. Insert into `messages` table (shared)
2. All conversation members see it
3. Each member has independent state (not created until needed)

### When a user flags a message:
1. Insert/update `message_user_state` for THAT user only
2. Other users unaffected
3. Query joins `message_user_state` filtered by user_id

### When a user archives a message:
1. Insert/update `message_user_state.archived_at` for THAT user only
2. Message stays in database (NO DELETE)
3. Query filters out WHERE archived_at IS NOT NULL

### When a user archives a conversation:
1. Update `conversation_members.archived_at` for THAT user only
2. All messages + conversation hidden for that user
3. Other members see conversation normally

### When a user unarchives:
1. SET archived_at = NULL (messages) or UPDATE conversation_members
2. Instant restore - no recreation needed
3. All relationships intact

## Why This Works

1. **No hard deletes** - Messages never leave database
2. **No restore complexity** - Just toggle archived_at flag
3. **Perfect isolation** - Each user_id has independent state
4. **Thread integrity** - parent_message_id always valid
5. **FERPA compliant** - User actions don't affect others
6. **Simple queries** - LEFT JOIN + WHERE filters
7. **Scalable** - Indexes on (user_id, message_id)

## What Gets Stored Where

**Shared Data (everyone sees same):**
- `messages`: id, sender, body, timestamps, thread relationships
- `conversations`: title, type, members list

**Private Data (per-user):**
- `message_user_state`: flags, archives (per message)
- `conversation_members.archived_at`: conversation archives
- `message_read_receipts`: read status

**The Key Insight:**
Message content is shared. Message STATE is private.

## Use Case 9: Admin as Messaging User

### Core Principle
**Admin functions as a regular messaging user (like a coach) with additional announcement capabilities. NO context switching.**

For troubleshooting individual user issues, admin uses the existing magic link feature to log in as that user.

### Setup: Admin Sarah's Messaging Identity

**Initial State:**
```
User: sarah-id (role: admin)
Profile: Sarah Smith (Admin)
```

Sarah has her OWN messaging inbox, separate from all coaches.

---

### Use Case 9.1: Admin Receives Messages from Users

**Scenario:** Coach Alice sends a message to Admin Sarah asking for help.

**Step 1: Alice composes message to Admin**
```typescript
// Alice creates a direct conversation with Admin Sarah
POST /api/messaging/conversations/create
{
  participant_ids: ['sarah-id'],  // Admin's user ID
  title: null  // Direct message, no title needed
}
```

**Backend creates conversation:**
```sql
INSERT INTO conversations (id, conversation_type, created_by)
VALUES ('conv-alice-sarah', 'direct', 'alice-id');

INSERT INTO conversation_members (conversation_id, user_id)
VALUES
  ('conv-alice-sarah', 'alice-id'),
  ('conv-alice-sarah', 'sarah-id');  -- Admin is a member
```

**Step 2: Alice sends message**
```sql
INSERT INTO messages (id, conversation_id, sender_id, body, created_at)
VALUES (
  'msg-701',
  'conv-alice-sarah',
  'alice-id',
  'Hi admin, I need help with the game platform sync.',
  '2025-01-12 09:00:00'
);
```

**Database State:**
```
conversations:
  conv-alice-sarah | direct | created_by: alice-id

conversation_members:
  conv-alice-sarah | alice-id | archived_at: NULL
  conv-alice-sarah | sarah-id | archived_at: NULL

messages:
  msg-701 | conv-alice-sarah | alice-id | "Hi admin, I need help..." | 09:00
```

**Step 3: Admin Sarah views her inbox**
```sql
SELECT c.*,
  COUNT(m.id) FILTER (WHERE mrr.read_at IS NULL) as unread_count
FROM conversations c
JOIN conversation_members cm ON cm.conversation_id = c.id
LEFT JOIN messages m ON m.conversation_id = c.id
LEFT JOIN message_read_receipts mrr ON (
  mrr.message_id = m.id AND mrr.user_id = 'sarah-id'
)
WHERE cm.user_id = 'sarah-id'  -- Sarah's conversations
  AND cm.archived_at IS NULL
GROUP BY c.id;
```

**Sarah sees:**
```
Conversations:
  - Alice Smith (1 unread)
```

**Sarah opens conversation:**
```sql
SELECT m.*,
  COALESCE(mus.flagged, false) as flagged,
  mus.archived_at
FROM messages m
LEFT JOIN message_user_state mus ON (
  mus.message_id = m.id AND mus.user_id = 'sarah-id'  -- Sarah's state
)
WHERE m.conversation_id = 'conv-alice-sarah'
  AND EXISTS (
    SELECT 1 FROM conversation_members cm
    WHERE cm.conversation_id = 'conv-alice-sarah'
      AND cm.user_id = 'sarah-id'  -- Verify Sarah is member
  );
```

**Sarah sees:**
```
msg-701 | Alice Smith | "Hi admin, I need help with the game platform sync." | flagged: false
```

**Result:** ✅ Admin receives and views messages like any other user

---

### Use Case 9.2: Admin Replies to User Messages

**Scenario:** Sarah replies to Alice's message.

**Step 1: Sarah types response**
```typescript
POST /api/messaging/conversations/conv-alice-sarah/messages
{
  body: "Hi Alice, I can help with that. What error are you seeing?",
  parent_message_id: "msg-701"
}
```

**Backend inserts message:**
```sql
INSERT INTO messages (id, conversation_id, sender_id, body, parent_message_id, created_at)
VALUES (
  'msg-702',
  'conv-alice-sarah',
  'sarah-id',  -- Admin is the sender
  'Hi Alice, I can help with that. What error are you seeing?',
  'msg-701',
  '2025-01-12 09:15:00'
);
```

**Database State:**
```
messages:
  msg-701 | conv-alice-sarah | alice-id  | "Hi admin, I need help..." | parent: NULL    | 09:00
  msg-702 | conv-alice-sarah | sarah-id  | "Hi Alice, I can help..."  | parent: msg-701 | 09:15
```

**Step 2: Alice views her inbox**
```sql
-- Same query as before, but user_id = 'alice-id'
```

**Alice sees:**
```
Conversations:
  - Sarah Smith (Admin) (1 unread)

Messages:
  msg-701 | You | "Hi admin, I need help..." | 09:00
  msg-702 | Sarah Smith (Admin) | "Hi Alice, I can help..." | 09:15 (unread)
```

**Result:** ✅ Admin sends messages like any coach. Users see admin's name and role.

---

### Use Case 9.3: Admin Flags a User's Message

**Scenario:** Sarah flags Alice's message to follow up later.

**Action:** Sarah clicks flag icon on msg-701

**Backend:**
```sql
INSERT INTO message_user_state (user_id, message_id, flagged, archived_at)
VALUES ('sarah-id', 'msg-701', true, NULL)
ON CONFLICT (user_id, message_id)
DO UPDATE SET flagged = true;
```

**Database State:**
```
message_user_state:
  1 | sarah-id | msg-701 | flagged: true | archived_at: NULL
```

**Sarah's view:**
```
msg-701 | Alice Smith | "Hi admin, I need help..." | flagged: TRUE ✅
```

**Alice's view (unchanged):**
```
msg-701 | You | "Hi admin, I need help..." | flagged: false
```

**Result:** ✅ Admin's flag is private to admin, just like any user

---

### Use Case 9.4: Admin Sends Announcement to All Users

**NEW FEATURE: Admin-only capability**

**Scenario:** Admin Sarah needs to notify all coaches about scheduled maintenance.

**Step 1: Sarah clicks "Send Announcement" button**
```typescript
// Admin-only UI element
POST /api/messaging/announcements/create
{
  title: "Scheduled Maintenance - Jan 15",
  body: "The dashboard will be offline from 2-4am EST for maintenance.",
  recipient_type: "coaches",  // "coaches" | "all"
  priority: "normal"  // "normal" | "urgent"
}
```

**Backend validation:**
```typescript
// Verify user is admin
const { data: profile } = await supabase
  .from('profiles')
  .select('role')
  .eq('id', userId)
  .single();

if (profile?.role !== 'admin') {
  throw new Error('Unauthorized: Only admins can send announcements');
}
```

**Backend creates announcement conversation:**
```sql
-- Create announcement conversation
INSERT INTO conversations (id, conversation_type, title, is_announcement, created_by)
VALUES (
  'conv-announce-001',
  'announcement',
  'Scheduled Maintenance - Jan 15',
  true,  -- Special flag for announcements
  'sarah-id'
);

-- Add admin as member
INSERT INTO conversation_members (conversation_id, user_id)
VALUES ('conv-announce-001', 'sarah-id');

-- Add ALL coaches as members (based on recipient_type)
INSERT INTO conversation_members (conversation_id, user_id)
SELECT 'conv-announce-001', id
FROM profiles
WHERE role = 'coach';

-- Insert announcement message
INSERT INTO messages (id, conversation_id, sender_id, body, created_at)
VALUES (
  'msg-announce-001',
  'conv-announce-001',
  'sarah-id',
  'The dashboard will be offline from 2-4am EST for maintenance.',
  '2025-01-12 10:00:00'
);
```

**Database State:**
```
conversations:
  conv-announce-001 | announcement | "Scheduled Maintenance - Jan 15" | is_announcement: true

conversation_members:
  conv-announce-001 | sarah-id  | archived_at: NULL (admin)
  conv-announce-001 | alice-id  | archived_at: NULL (coach)
  conv-announce-001 | bob-id    | archived_at: NULL (coach)
  conv-announce-001 | carol-id  | archived_at: NULL (coach)
  ... (all coaches)

messages:
  msg-announce-001 | conv-announce-001 | sarah-id | "The dashboard will be offline..." | 10:00
```

**Step 2: All coaches see announcement in their inbox**

**Alice's inbox query:**
```sql
SELECT c.*,
  COUNT(m.id) FILTER (WHERE mrr.read_at IS NULL) as unread_count
FROM conversations c
JOIN conversation_members cm ON cm.conversation_id = c.id
LEFT JOIN messages m ON m.conversation_id = c.id
LEFT JOIN message_read_receipts mrr ON (
  mrr.message_id = m.id AND mrr.user_id = 'alice-id'
)
WHERE cm.user_id = 'alice-id'
  AND cm.archived_at IS NULL
GROUP BY c.id;
```

**Alice sees:**
```
Conversations:
  📢 Scheduled Maintenance - Jan 15 (1 unread) [ANNOUNCEMENT BADGE]
```

**Alice opens announcement:**
```
From: Sarah Smith (Admin)
Subject: Scheduled Maintenance - Jan 15

The dashboard will be offline from 2-4am EST for maintenance.

[Reply button DISABLED for announcements]
```

**Step 3: Announcement behavior rules**

**Read-only for recipients:**
- Coaches can READ announcements
- Coaches can FLAG announcements (personal flag)
- Coaches can ARCHIVE announcements (personal archive)
- Coaches CAN reply to announcements however, a reply starts a DM conversation with announcement sender. 
- Coaches CANNOT add members to announcement conversations

**Database enforcement:**
```sql
-- RLS policy: Only admin can send messages in announcement conversations
CREATE POLICY "announcements_admin_only"
ON messages FOR INSERT
USING (
  NOT EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = conversation_id AND c.is_announcement = true
  )
  OR
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);
```

**Result:** ✅ Admin can broadcast to all users. Users receive as read-only.

---

### Use Case 9.5: Admin Archives Conversation (Personal)

**Scenario:** Sarah resolves Alice's issue and archives the conversation.

**Action:** Sarah clicks archive on conv-alice-sarah

**Backend:**
```sql
UPDATE conversation_members
SET archived_at = NOW()
WHERE conversation_id = 'conv-alice-sarah' AND user_id = 'sarah-id';
```

**Database State:**
```
conversation_members:
  conv-alice-sarah | alice-id  | archived_at: NULL  (Alice still sees it)
  conv-alice-sarah | sarah-id  | archived_at: 2025-01-12 11:00  (Sarah archived it)
```

**Sarah's inbox:**
```
Conversations:
  (conv-alice-sarah is HIDDEN)
```

**Alice's inbox:**
```
Conversations:
  - Sarah Smith (Admin) (0 unread)
  ☝️ Alice still sees the conversation
```

**Result:** ✅ Admin's archive is personal, doesn't affect Alice

---

### Use Case 9.6: Troubleshooting User Issues (Magic Link)

**Scenario:** Alice reports she can't see a specific message, but Sarah needs to see Alice's exact view to debug.

**Step 1: Sarah uses existing magic link feature**
```typescript
// Admin clicks "Login as Alice" in admin tools
POST /api/admin/generate-magic-link
{
  user_id: 'alice-id',
  reason: 'Debug missing message issue'
}

// Returns: magic link URL
// Audit log: INSERT INTO admin_actions (admin_id, action, target_user_id, reason)
```

**Step 2: Sarah opens magic link in incognito window**
```
New browser session:
  - Logged in AS Alice (not as admin viewing Alice)
  - auth.uid() returns 'alice-id'
  - All queries use Alice's actual permissions
  - Sarah sees EXACTLY what Alice sees
```

**Step 3: Sarah debugs issue while logged in as Alice**
```sql
-- All queries run as Alice
SELECT * FROM messages WHERE ...
-- Uses Alice's RLS policies, Alice's state, Alice's permissions
```

**Step 4: Sarah exits (closes incognito window)**
```
Original session still active:
  - Sarah is sarah-id (admin)
  - Sarah's own messaging inbox
  - No context switching confusion
```

**Result:** ✅ For troubleshooting, use magic link (separate session). For messaging, admin is just another user.

---

## Admin Messaging Summary

### Admin Capabilities

**Same as Regular Users:**
- ✅ Receive direct messages from coaches
- ✅ Reply to messages in conversations
- ✅ Flag messages (private to admin)
- ✅ Archive conversations (private to admin)
- ✅ Search their own messages
- ✅ Mark messages as read/unread

**Admin-Only Features:**
- ✅ Send announcements to groups (coaches, all)
- ✅ Announcements are read-only for recipients
- ✅ Announcements have special badge/UI treatment
- ✅ NO context switching in main session
- ✅ Keeps admin messaging identity clean and simple


### Why This Approach Works

**Simplicity:**
- No context switching logic
- No effective user ID calculations
- No admin-specific query paths

**Security:**
- Clear audit trail (admin messages show admin as sender)
- No confusion about who did what

**FERPA Compliance:**
- Admin's flags/archives are private to admin
- Admin cannot see other users' flags/archives
- Admin cannot accidentally modify other users' state

**User Experience:**
- Users know when they're talking to admin
- Admin has clear messaging identity
- Announcements are clearly marked

**Key Principle:**
Admin is a first-class messaging user, not a shapeshifter.
