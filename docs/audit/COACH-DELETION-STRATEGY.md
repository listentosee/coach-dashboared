# Coach Deletion Strategy - FERPA Compliant

**Date:** 2025-10-09
**Issue:** Cannot delete coaches due to foreign key constraints
**FERPA Requirement:** Must maintain audit trail while allowing user removal

---

## Current Problem

When attempting to delete a coach (user), we get this error:
```
ERROR: update or delete on table "users" violates foreign key constraint
"conversations_created_by_fkey" on table "conversations" (SQLSTATE 23503)
```

**Tables involved:**
- `auth.users` (coach accounts)
- `conversations` (created_by → users.id, NOT NULL)
- `conversation_members` (user_id → users.id)
- `messages` (sender_id → users.id)

---

## FERPA Compliance Requirements

### Must Preserve:
✅ **Audit trail** - Who created what, when
✅ **Message history** - For compliance/legal reasons
✅ **Conversation context** - May reference student data

### Can Allow:
⚠️ **Coach account removal** - For legitimate business reasons
⚠️ **Anonymization** - Replace PII with generic identifiers

---

## Recommended Solution: Soft Delete + Anonymization

**Don't actually delete the user** - mark them as deleted and anonymize.

### Step 1: Add Soft Delete Fields to Profiles

```sql
-- Add soft delete tracking
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

-- Add index for filtering
CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at
  ON profiles(deleted_at) WHERE deleted_at IS NOT NULL;
```

### Step 2: Create Coach Anonymization Function

```sql
CREATE OR REPLACE FUNCTION anonymize_coach(coach_user_id UUID, reason TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  anonymized_email TEXT;
  original_email TEXT;
BEGIN
  -- Get original email for audit
  SELECT email INTO original_email
  FROM auth.users
  WHERE id = coach_user_id;

  -- Generate anonymized email
  anonymized_email := 'deleted_' || REPLACE(coach_user_id::TEXT, '-', '') || '@deleted.local';

  -- Update auth.users (anonymize)
  UPDATE auth.users
  SET
    email = anonymized_email,
    phone = NULL,
    raw_user_meta_data = jsonb_build_object(
      'deleted', true,
      'deleted_at', NOW(),
      'original_email_hash', md5(original_email)
    )
  WHERE id = coach_user_id;

  -- Update profile (soft delete + audit trail)
  UPDATE profiles
  SET
    deleted_at = NOW(),
    deleted_by = auth.uid(),
    deletion_reason = reason
  WHERE id = coach_user_id;

  -- Log the deletion for audit
  INSERT INTO activity_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'coach_anonymized',
    'profile',
    coach_user_id,
    jsonb_build_object(
      'original_email_hash', md5(original_email),
      'reason', reason,
      'anonymized_email', anonymized_email
    )
  );

  -- Note: Conversations, messages remain untouched with original user_id
  -- This preserves audit trail and message history

  RETURN TRUE;
END;
$$;
```

### Step 3: Update RLS Policies to Hide Deleted Coaches

```sql
-- Update existing coach policies to exclude deleted
DROP POLICY IF EXISTS "coaches_can_view_own_competitors" ON competitors;
CREATE POLICY "coaches_can_view_own_competitors"
  ON competitors FOR SELECT
  USING (
    coach_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND deleted_at IS NOT NULL
    )
  );

-- Exclude deleted coaches from admin views
CREATE OR REPLACE FUNCTION is_active_coach(user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = user_id
    AND role = 'coach'
    AND deleted_at IS NULL
  );
$$ LANGUAGE SQL STABLE;
```

### Step 4: Usage

```sql
-- Anonymize a coach (from admin panel)
SELECT anonymize_coach(
  '91090a19-b623-4c22-af5e-0f5939d57803'::UUID,
  'Coach requested account deletion'
);

-- Query active coaches only
SELECT * FROM profiles
WHERE role = 'coach'
AND deleted_at IS NULL;

-- View deleted coaches (admin only)
SELECT
  id,
  deleted_at,
  deletion_reason,
  deleted_by
FROM profiles
WHERE deleted_at IS NOT NULL;
```

---

## Alternative Solution: Denormalize Creator Info

If you really need to support hard deletes:

### Add Denormalized Columns

```sql
-- Add creator email/name to preserve after deletion
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS created_by_email TEXT,
  ADD COLUMN IF NOT EXISTS created_by_name TEXT;

-- Populate existing records
UPDATE conversations c
SET
  created_by_email = u.email,
  created_by_name = COALESCE(p.name, u.email)
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE c.created_by = u.id
  AND c.created_by_email IS NULL;

-- Same for messages
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS sender_email TEXT,
  ADD COLUMN IF NOT EXISTS sender_name TEXT;

UPDATE messages m
SET
  sender_email = u.email,
  sender_name = COALESCE(p.name, u.email)
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE m.sender_id = u.id
  AND m.sender_email IS NULL;
```

### Then Allow NULL + SET NULL

```sql
-- Make FKs nullable and use ON DELETE SET NULL
ALTER TABLE conversations
  ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_created_by_fkey,
  ADD CONSTRAINT conversations_created_by_fkey
    FOREIGN KEY (created_by)
    REFERENCES auth.users(id)
    ON DELETE SET NULL;

-- Same for messages
ALTER TABLE messages
  ALTER COLUMN sender_id DROP NOT NULL;

ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_sender_id_fkey,
  ADD CONSTRAINT messages_sender_id_fkey
    FOREIGN KEY (sender_id)
    REFERENCES auth.users(id)
    ON DELETE SET NULL;

-- conversation_members can CASCADE (no longer a member if user deleted)
ALTER TABLE conversation_members
  DROP CONSTRAINT IF EXISTS conversation_members_user_id_fkey,
  ADD CONSTRAINT conversation_members_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE;
```

---

## Comparison of Approaches

| Approach | Pros | Cons | FERPA Compliance |
|----------|------|------|------------------|
| **Soft Delete + Anonymization** | ✅ Full audit trail<br>✅ No schema changes<br>✅ Easy to implement<br>✅ Can "undelete" | ❌ User record remains<br>❌ Harder to truly remove PII | ✅ Excellent |
| **Denormalize + SET NULL** | ✅ True deletion possible<br>✅ Preserves who created what<br>✅ FERPA compliant | ❌ Data duplication<br>❌ Requires schema changes<br>❌ Triggers needed for auto-population | ✅ Good |
| **CASCADE Delete** | ✅ Clean deletion<br>✅ No orphaned records | ❌ Loses message history<br>❌ Loses audit trail<br>❌ Not FERPA compliant | ❌ Poor |

---

## Recommended Implementation

**Use Soft Delete + Anonymization** because:

1. **FERPA Compliant** - Maintains complete audit trail
2. **Simple** - No schema changes to messaging tables
3. **Reversible** - Can restore if needed
4. **Secure** - Anonymizes PII (email becomes `deleted_xxxxx@deleted.local`)
5. **Auditable** - Logs who deleted, when, why

### What Happens When Coach is "Deleted"

✅ **Profile marked** as deleted (soft delete)
✅ **Email anonymized** to prevent login
✅ **Audit log created** with deletion details
✅ **Conversations preserved** with original creator ID
✅ **Messages preserved** with original sender ID
✅ **Cannot log in** (email doesn't match)
✅ **Hidden from UI** (RLS excludes deleted coaches)

### To View Message History

```sql
-- Messages from deleted coaches still visible
SELECT
  m.body,
  m.created_at,
  CASE
    WHEN p.deleted_at IS NOT NULL
    THEN '[Deleted User]'
    ELSE COALESCE(p.name, u.email)
  END as sender_name
FROM messages m
JOIN auth.users u ON u.id = m.sender_id
LEFT JOIN profiles p ON p.id = u.id;
```

---

## Migration Script

See: `supabase/migrations/20251009_coach_soft_delete.sql`

---

## UI Changes Needed

### Admin Panel: Delete Coach Button

```typescript
// Instead of hard delete
async function deleteCoach(coachId: string, reason: string) {
  const { error } = await supabase.rpc('anonymize_coach', {
    coach_user_id: coachId,
    reason: reason
  });

  if (error) {
    throw error;
  }

  // Success - coach anonymized and soft deleted
}
```

### Message Display

```typescript
// Show "[Deleted User]" for deleted coaches
function getSenderName(message: Message, profiles: Profile[]) {
  const profile = profiles.find(p => p.id === message.sender_id);

  if (!profile || profile.deleted_at) {
    return '[Deleted User]';
  }

  return profile.name || profile.email;
}
```

---

## Testing Checklist

- [ ] Create test coach account
- [ ] Coach creates conversations and sends messages
- [ ] Admin anonymizes coach
- [ ] Verify coach cannot log in
- [ ] Verify conversations still visible to recipients
- [ ] Verify messages show "[Deleted User]"
- [ ] Verify audit log created
- [ ] Verify no errors in application

---

## FERPA Compliance Checklist

- [x] Audit trail maintained
- [x] Message history preserved
- [x] Deletion logged
- [x] PII anonymized (email changed)
- [x] Can demonstrate who did what
- [x] Prevents unauthorized access (can't log in)

---

## Rollback Plan

If soft delete causes issues:

```sql
-- Restore a "deleted" coach
UPDATE profiles
SET deleted_at = NULL
WHERE id = 'coach-id';

UPDATE auth.users
SET email = 'original@email.com'  -- Must know original email
WHERE id = 'coach-id';
```

---

**Recommendation:** Implement soft delete + anonymization approach for FERPA compliance and audit trail preservation.
