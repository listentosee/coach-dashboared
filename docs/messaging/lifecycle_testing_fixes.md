# Coach Messaging - Lifecycle Testing Fixes

**Document Version:** 1.0
**Date:** October 4, 2025
**Based on:** Section 5.1 Coach Inbox Testing Results
**Status:** Planning

---

## Executive Summary

This document outlines the fixes needed for the coach messaging interface based on lifecycle testing failures. Issues are prioritized by impact and organized into phases for systematic implementation.

**Total Issues:** 8
**Critical:** 2
**Important:** 2
**Feature Implementation:** 4

---

## Priority 1: Critical Fixes

### 1.1 Fix Reply 403 Error

**Status:** ✅ COMPLETE
**Impact:** Users cannot reply to messages

**Issue Description:**
- Clicking reply returns 403 Forbidden error
- Prevents basic messaging functionality

**Root Cause Investigation:**
- [x] Check `/api/messaging/conversations/[id]/messages/route.ts` for auth issues
- [x] Verify `messages_insert_allowed` RLS policy allows group conversations
- [x] Confirm policy allows members to post in 'dm' AND 'group' types
- [x] Check composer API call includes proper authentication headers
- [x] Verify Supabase client has correct session

**Files Modified:**
- [x] `app/api/messaging/conversations/[id]/messages/route.ts` - Updated to use simplified get_conversation_messages
- [x] Database: Updated `messages_insert_allowed` policy and added conversation creation functions
- [x] `app/api/messaging/conversations/dm/route.ts` - Uses create_dm_conversation RPC

**Testing Checklist:**
- [x] Can reply to DM conversations
- [x] Can reply to group conversations
- [x] Can reply to announcement threads (creates new DM)
- [x] Reply appears in conversation immediately
- [x] Reply visible to sender in real-time

**Notes:**
Current policy may only allow 'dm' type. Schema shows policy should be updated to include 'group':
```sql
-- Current policy restricts to 'dm' only
-- Need to extend to: IN ('dm','group')
```

---

### 1.2 Fix Subject/Title Display

**Status:** ✅ COMPLETE
**Impact:** Users see body text instead of subject/title everywhere

**Issue Description:**
- Message preview shows body snippet instead of subject
- Reader pane header shows body text instead of subject
- Thread view shows body as title
- All message types affected

**Root Cause Investigation:**
- [x] Messages table missing dedicated `subject` field
- [x] Components using `body` field for preview
- [x] Determined subject storage strategy: Use conversation.title (KISS approach)

**Design Decision Required:**
Choose one approach for subject field:

👍 **Option A: Add Subject Column (Recommended)**
```sql
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS subject TEXT;
```
- ✅ Pros: Clean separation, efficient queries, standard pattern
- ❌ Cons: Requires migration, nullable field

**Option B: Use Metadata JSONB**
```json
{ "subject": "Message subject here" }
```
- ✅ Pros: No schema change, flexible
- ❌ Cons: Harder to query, less efficient

**Option C: Parse First Line of Body**
- ✅ Pros: No schema change
- ❌ Cons: Fragile, limits body formatting, performance overhead

**👉 DECISION:** Use conversation.title (KISS - no per-message subject field)

**Files Modified:**
- [x] `components/coach-messaging/inbox-pane.tsx` - Uses conversation.title for display
- [x] `components/coach-messaging/reader-pane.tsx` - Shows conversation.title in header
- [x] `components/coach-messaging/composer-modal.tsx` - Subject field sets conversation title
- [x] `lib/coach-messaging/types.ts` - Uses CoachConversation.title
- [x] `lib/coach-messaging/use-coach-messaging-data.ts` - Simplified to fetch by conversation
- [x] Migration: `20251004_simplify_messaging_kiss.sql` - Removed threading complexity

**Testing Checklist:**
- [x] Subject appears in inbox conversation preview
- [x] Subject appears in reader pane header
- [x] Subject shown as conversation title
- [x] Can compose message with subject (sets conversation.title)
- [x] Can reply with subject (Re: prefix for announcement replies)
- [x] Empty subject handled gracefully (shows display_title or sender name)
- [x] Subject displays correctly for DM/Group/Announcement types

---

## Priority 2: Important UX Issues

### 2.1 Fix Unread Count Badge

**Status:** ✅ COMPLETE
**Impact:** Inaccurate unread counts confuse users

**Issue Description:**
- Badge shows 3 unread messages
- List only shows 2 unread messages
- Missing group email message in count

**Root Cause Investigation:**
- [x] Check unread count calculation in `use-coach-messaging-data.ts`
- [x] Verify group messages included in query
- [x] Check if announcement messages counted correctly
- [x] Verify sender filter (don't count own messages)
- [x] Real-time subscription fixed to update counts properly

**Files Modified:**
- [x] `lib/coach-messaging/use-coach-messaging-data.ts` - Added real-time message subscription with debounce
- [x] `app/dashboard/layout.tsx` - Real-time unread count updates
- [x] Database functions working correctly with simplified architecture

**Testing Checklist:**
- [x] Unread count matches visible unread messages
- [x] DM messages counted correctly
- [x] Group messages counted correctly
- [x] Announcement messages counted correctly
- [x] Own messages NOT counted as unread
- [x] Count updates in real-time when message read
- [x] Count updates when new message arrives

---

### 2.2 Hide "Not Seen" Bar in Coach Context

**Status:** ✅ COMPLETE
**Impact:** Admin-only UI element confuses coaches

**Issue Description:**
- "Not Seen" read receipt bar displays in coach view
- Feature is admin-only per architecture docs
- Should be hidden for coach role

**Root Cause Investigation:**
- [x] Check `reader-pane.tsx` for role-based rendering
- [x] Verify `message-viewer.tsx` read receipt display logic
- [x] Confirm role detection working correctly

**Files Modified:**
- [x] `components/coach-messaging/reader-pane.tsx` - Added userRole prop and conditional rendering
- [x] `components/coach-messaging/coach-messaging-workspace.tsx` - Passes userRole to reader pane

**Testing Checklist:**
- [x] "Not Seen" bar hidden when logged in as coach
- [x] "Not Seen" bar visible when logged in as admin
- [x] No console errors when toggling visibility
- [x] Other reader pane features unaffected

**Implementation:**
```tsx
// Pseudo-code
const { userRole } = useAuth(); // or pass as prop
const showReadReceipts = userRole === 'admin';

{showReadReceipts && <ReadReceiptBar />}
```

---

## Priority 3: Feature Implementation

### 3.1 Implement Pin/Unpin Messages

**Status:** 🔵 NEW FEATURE
**Impact:** Allows users to keep important messages at top of inbox

**Requirements:**
- Full pin/unpin functionality with UI controls
- Pinned messages appear at top of inbox
- Pin state persists per user (not global)
- Visual indicator on pinned messages

**Database Changes:**
```sql
-- Migration: 20251004_add_message_pinning.sql
ALTER TABLE public.conversation_members
  ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

CREATE INDEX idx_conversation_members_pinned
  ON public.conversation_members(user_id, pinned_at DESC)
  WHERE pinned = TRUE;
```

**API Endpoints:**
- [ ] `POST /api/messaging/conversations/[id]/pin`
  - Sets `pinned = true`, `pinned_at = now()`
  - Returns updated conversation member record
- [ ] `DELETE /api/messaging/conversations/[id]/pin` (or POST with unpin action)
  - Sets `pinned = false`, `pinned_at = null`
  - Returns success

**Files to Create/Modify:**
- [ ] Create migration file: `supabase/migrations/20251004_add_message_pinning.sql`
- [ ] Create: `app/api/messaging/conversations/[id]/pin/route.ts`
- [ ] Modify: `components/coach-messaging/inbox-action-bar.tsx` - Add pin button
- [ ] Modify: `components/coach-messaging/inbox-conversation-row.tsx` - Show pin icon
- [ ] Modify: `components/coach-messaging/reader-header.tsx` - Add pin/unpin action
- [ ] Modify: `components/coach-messaging/inbox-pane.tsx` - Sort pinned to top
- [ ] Modify: `lib/coach-messaging/use-coach-messaging-data.ts` - Include pin state
- [ ] Modify: `lib/coach-messaging/types.ts` - Add pinned fields to ConversationMember

**UI Design:**
- [ ] Pin icon: 📌 or `<Pin>` lucide icon
- [ ] Pinned messages have subtle background color
- [ ] Pin/unpin in action bar and reader header
- [ ] Tooltip: "Pin this conversation"
- [ ] Pinned section separator or just sorted to top?

**Testing Checklist:**
- [ ] Can pin conversation from action bar
- [ ] Can pin conversation from reader header
- [ ] Can unpin conversation
- [ ] Pinned conversations appear at top of inbox
- [ ] Pin state persists on refresh
- [ ] Pin state specific to user (not global)
- [ ] Pin icon visible on pinned conversations
- [ ] Multiple conversations can be pinned
- [ ] Unpinning moves conversation back to chronological order

**👉 DECISION NEEDED:**
- Show pinned as separate section with divider? **Y** / N: _____Yes____________
- Maximum number of pinned conversations? (none / 5 / **10**): ____10_____________

---

### 3.2 Implement Archive Functionality

**Status:** 🔵 NEW FEATURE
**Impact:** Allows users to hide completed/old conversations

**Requirements:**
- Archive hides message from inbox load/view
- Archived messages accessible via "View Archived" dialog
- Can restore archived messages to inbox
- Archive state per-user (not global)

**Database Changes:**
```sql
-- Migration: 20251004_add_message_archiving.sql
ALTER TABLE public.conversation_members
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX idx_conversation_members_archived
  ON public.conversation_members(user_id, archived_at)
  WHERE archived_at IS NOT NULL;
```

**API Endpoints:**
- [ ] `POST /api/messaging/conversations/[id]/archive`
  - Sets `archived_at = now()`
  - Returns success
- [ ] `POST /api/messaging/conversations/[id]/unarchive`
  - Sets `archived_at = null`
  - Returns success
- [ ] `GET /api/messaging/conversations?archived=true`
  - Returns archived conversations only
  - Sorted by archived_at DESC

**Files to Create/Modify:**
- [ ] Create migration: `supabase/migrations/20251004_add_message_archiving.sql`
- [ ] Create: `app/api/messaging/conversations/[id]/archive/route.ts`
- [ ] Modify: `app/api/messaging/conversations/route.ts` - Add archived filter
- [ ] Modify: `components/coach-messaging/inbox-action-bar.tsx` - Add "View Archived" button
- [ ] Create: `components/coach-messaging/archived-dialog.tsx` - View archived messages
- [ ] Modify: `components/coach-messaging/reader-header.tsx` - Add archive action
- [ ] Modify: `components/coach-messaging/inbox-pane.tsx` - Filter out archived by default
- [ ] Modify: `lib/coach-messaging/use-coach-messaging-data.ts` - Handle archived state
- [ ] Modify: `lib/coach-messaging/types.ts` - Add archived_at to ConversationMember

**UI Design:**
- [ ] Archive icon: `<Archive>` lucide icon
- [ ] Archive action in reader header dropdown
- [ ] "View Archived" button in action bar
- [ ] Archived dialog shows list of archived conversations
- [ ] Can restore from archived dialog
- [ ] Toast notification: "Conversation archived" with undo
- [ ] Archived count badge? (e.g., "Archived (5)")

**Testing Checklist:**
- [ ] Can archive conversation from reader header
- [ ] Archived conversation disappears from inbox
- [ ] Can view archived conversations via dialog
- [ ] Can restore archived conversation
- [ ] Restored conversation reappears in inbox
- [ ] Archive state persists on refresh
- [ ] Archive state specific to user (not global)
- [ ] Archived conversations sorted by archive date
- [ ] Can archive multiple conversations
- [ ] Search doesn't include archived (or does it?)

**👉 DECISION NEEDED:**
- Should search include archived messages? Y / N: ______Y___________
- Auto-archive after X days of inactivity? Y / N: ______N___________ (If yes, X = ___)

---

### 3.3 Implement Full-Text Search

**Status:** 🔵 NEW FEATURE
**Impact:** Enables fast search across messages

**Requirements:**
- Full-text database query (not client-side filter)
- Search by sender, subject, and content
- Real-time search with debouncing
- Highlight search terms in results

**Database Changes:**
```sql
-- Migration: 20251004_add_fulltext_search.sql

-- Add tsvector column for search
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS search_vector TSVECTOR;

-- Create GIN index for fast full-text search
CREATE INDEX idx_messages_fulltext_search
  ON public.messages USING GIN(search_vector);

-- Trigger to maintain search_vector
CREATE OR REPLACE FUNCTION messages_search_trigger()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.subject, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.body, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(
      (SELECT first_name || ' ' || last_name FROM public.profiles WHERE id = NEW.sender_id),
      ''
    )), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tsvector_update_messages
  BEFORE INSERT OR UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION messages_search_trigger();

-- Backfill existing messages
UPDATE public.messages
SET search_vector =
  setweight(to_tsvector('english', COALESCE(subject, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(body, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(
    (SELECT first_name || ' ' || last_name FROM public.profiles WHERE id = sender_id),
    ''
  )), 'C');

-- Search function
CREATE OR REPLACE FUNCTION search_messages(
  p_user_id UUID,
  p_query TEXT,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  message_id BIGINT,
  conversation_id UUID,
  subject TEXT,
  body TEXT,
  sender_id UUID,
  created_at TIMESTAMPTZ,
  rank REAL
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.conversation_id,
    m.subject,
    m.body,
    m.sender_id,
    m.created_at,
    ts_rank(m.search_vector, query) as rank
  FROM public.messages m
  JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
  CROSS JOIN to_tsquery('english', p_query) query
  WHERE cm.user_id = p_user_id
    AND m.search_vector @@ query
  ORDER BY rank DESC, m.created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION search_messages(UUID, TEXT, INT) TO authenticated;
```

**API Endpoints:**
- [ ] `GET /api/messaging/search?q=query&limit=50`
  - Calls `search_messages()` RPC
  - Returns messages with rank score
  - Includes conversation context

**Files to Create/Modify:**
- [ ] Create migration: `supabase/migrations/20251004_add_fulltext_search.sql`
- [ ] Create: `app/api/messaging/search/route.ts`
- [ ] Modify: `components/coach-messaging/inbox-action-bar.tsx` - Add search input
- [ ] Create: `components/coach-messaging/search-results.tsx` - Display search results
- [ ] Modify: `components/coach-messaging/inbox-pane.tsx` - Show search results mode
- [ ] Create: `lib/coach-messaging/use-message-search.ts` - Search hook with debouncing
- [ ] Modify: `lib/coach-messaging/types.ts` - Add SearchResult type

**UI Design:**
- [ ] Search input in action bar
- [ ] Debounce: 300ms after typing stops
- [ ] Show "Searching..." indicator
- [ ] Search results replace inbox list (or overlay?)
- [ ] Highlight matching terms in results
- [ ] Click result navigates to message in conversation
- [ ] Clear button to exit search mode
- [ ] Empty state: "No results for 'query'"
- [ ] Show result count: "5 messages found"

**Search Query Processing:**
- [ ] Sanitize user input
- [ ] Convert to tsquery format (handle spaces, special chars)
- [ ] Support phrase search: "exact phrase"
- [ ] Support AND/OR operators?

**Testing Checklist:**
- [ ] Can search by subject
- [ ] Can search by message body
- [ ] Can search by sender name
- [ ] Search returns relevant results
- [ ] Search results ranked by relevance
- [ ] Search highlights matching terms
- [ ] Can click result to view message
- [ ] Can clear search to return to inbox
- [ ] Search respects user permissions (RLS)
- [ ] Empty query shows no results
- [ ] Special characters handled correctly
- [ ] Search performance acceptable (<500ms)

**👉 DECISIONS NEEDED:**
- Search scope: Subject + Body + Sender (as shown) or other fields? ____Subject, Body and Sender_____________
- Advanced operators (AND/OR)? Y / N: _______N__________
- Search includes archived messages? Y / N: ______Y___________
- Max results limit: 50 / 100 / unlimited: _______50__________

---

## Implementation Phases

### Phase 1: Critical Fixes (Days 1-2)
- [x] Fix reply 403 error
- [x] Fix subject/title display (using conversation.title - KISS approach)
- [x] Fix unread count badge
- [x] Hide "Not Seen" bar

**Exit Criteria:** ✅ COMPLETE - Basic messaging works, displays correct information

---

### Phase 2: Pin & Archive (Days 3-4)
- [ ] Database migrations
- [ ] Pin functionality
- [ ] Archive functionality
- [ ] UI integration

**Exit Criteria:** Users can pin and archive conversations

---

### Phase 3: Search (Days 5-6)
- [ ] Database migration with full-text search
- [ ] Search API endpoint
- [ ] Search UI components
- [ ] Performance testing

**Exit Criteria:** Fast, accurate search across all messages

---

### Phase 4: Testing & Polish (Day 7)
- [ ] Full lifecycle testing
- [ ] Cross-browser testing
- [ ] Performance optimization
- [ ] Documentation updates

**Exit Criteria:** All features tested and documented

---

## Testing Strategy

### Manual Testing Checklist
After each phase:
- [ ] Test in Chrome
- [ ] Test in Firefox
- [ ] Test in Safari
- [ ] Test real-time updates
- [ ] Test with multiple users
- [ ] Test error states
- [ ] Test edge cases (empty states, max limits)

### Automated Testing
- [ ] API endpoint tests for new routes
- [ ] Database migration tests
- [ ] Component unit tests
- [ ] E2E tests for critical flows

---

## Questions & Decisions

### Subject Field Implementation
**Question:** How should message subjects be stored?

**Options:**
- A) Add dedicated `subject` column to messages ✅ RECOMMENDED
- B) Store in `metadata` JSONB
- C) Parse from first line of body

**Decision:** ______A___________
**Rationale:** _____Best Practice____________

---

### Archive Behavior
**Question:** Should search include archived messages?

**Decision:** Y / N: _______Y__________
**Rationale:** _________________

**Question:** Auto-archive after X days of inactivity?

**Decision:** Y / N: _______N__________
**If yes, X = _____ days**
**Rationale:** ______KISS___________

---

### Pin Limits
**Question:** Show pinned as separate section with divider?

**Decision:** Y / N: ________Y_________

**Question:** Maximum number of pinned conversations?

**Decision:** None / 5 / 10 / Other: _______10__________
**Rationale:** _____KISS____________

---

### Search Scope
**Question:** Search scope beyond Subject + Body + Sender?

**Additional fields:** ______N/A___________

**Question:** Support advanced operators (AND/OR)?

**Decision:** Y / N: ______N___________
**Rationale:** ______KISS___________

**Question:** Search includes archived messages?

**Decision:** Y / N: _______Y__________

**Question:** Max search results?

**Decision:** 50 / 100 / Unlimited: ________50_________

---

## Migration Rollback Plan

If issues arise, rollback procedures for each phase:

### Phase 1 Rollback
```sql
-- No schema changes, just code revert
```

### Phase 2 Rollback
```sql
ALTER TABLE public.conversation_members
  DROP COLUMN IF EXISTS pinned,
  DROP COLUMN IF EXISTS pinned_at,
  DROP COLUMN IF EXISTS archived_at;
```

### Phase 3 Rollback
```sql
DROP TRIGGER IF EXISTS tsvector_update_messages ON public.messages;
DROP FUNCTION IF EXISTS messages_search_trigger();
DROP FUNCTION IF EXISTS search_messages(UUID, TEXT, INT);
ALTER TABLE public.messages DROP COLUMN IF EXISTS search_vector;
```

---

## Success Metrics

### Functional Metrics
- [ ] 0 reply failures (was: 100% failure rate)
- [ ] 100% accurate unread counts
- [ ] Subject displays in all contexts
- [ ] Pin/unpin works reliably
- [ ] Archive/restore works reliably
- [ ] Search returns results <500ms

### User Experience Metrics
- [ ] Positive feedback on search utility
- [ ] Adoption of pin feature >20%
- [ ] Adoption of archive feature >30%
- [ ] No increase in support tickets
- [ ] Reduced time to find messages

---

## Notes

- All features should respect existing RLS policies
- Real-time updates must work for all new features
- Mobile responsiveness required for all UI changes
- Accessibility: keyboard navigation, ARIA labels
- Error states: graceful fallbacks for all operations

---

## Sign-off

**Reviewed by:** _____SY____________
**Approved by:** _____SY____________
**Implementation Start:** _________________
**Target Completion:** _________________

---

*End of Document*
