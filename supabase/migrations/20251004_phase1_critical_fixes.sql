-- Phase 1: Critical Fixes for Coach Messaging
-- Date: October 4, 2025
-- Description: Fix reply 403 error and add subject field

BEGIN;

-- ============================================================================
-- 1. Fix Reply 403 Error
-- ============================================================================

-- Enable 'group' conversation type (if not already enabled)
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_type_check;
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_type_check
  CHECK (type IN ('dm','group','announcement'));

-- Update messages insert policy to allow members to post in 'dm' AND 'group'
DROP POLICY IF EXISTS messages_insert_allowed ON public.messages;

CREATE POLICY messages_insert_allowed ON public.messages
  FOR INSERT WITH CHECK (
    public.is_admin(auth.uid())
    OR (
      EXISTS (
        SELECT 1 FROM public.conversation_members m
        WHERE m.conversation_id = messages.conversation_id
          AND m.user_id = auth.uid()
          AND (m.muted_until IS NULL OR m.muted_until < now())
      )
      AND (
        SELECT c.type FROM public.conversations c WHERE c.id = messages.conversation_id
      ) IN ('dm','group')
    )
  );

-- ============================================================================
-- 2. Add Subject Field
-- ============================================================================

-- Add subject column to messages table
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS subject TEXT;

-- Backfill existing messages with subject from conversation title
-- Only update messages where conversation has a title set
UPDATE public.messages m
SET subject = c.title
FROM public.conversations c
WHERE m.conversation_id = c.id
  AND m.subject IS NULL
  AND c.title IS NOT NULL
  AND c.title != '';

-- Add index for subject searches (will be used in Phase 3 full-text search)
CREATE INDEX IF NOT EXISTS idx_messages_subject
  ON public.messages(subject)
  WHERE subject IS NOT NULL;

-- ============================================================================
-- 3. Update RPC Functions to Include Subject
-- ============================================================================

-- Drop existing function first (return type is changing)
DROP FUNCTION IF EXISTS public.list_messages_with_sender_v2(UUID, INT);

-- Create function with subject field
CREATE OR REPLACE FUNCTION public.list_messages_with_sender_v2(
  p_conversation_id UUID,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id BIGINT,
  conversation_id UUID,
  sender_id UUID,
  subject TEXT,
  body TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  parent_message_id BIGINT,
  sender_first_name TEXT,
  sender_last_name TEXT,
  sender_email TEXT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.conversation_id,
    m.sender_id,
    m.subject,
    m.body,
    m.metadata,
    m.created_at,
    m.parent_message_id,
    p.first_name AS sender_first_name,
    p.last_name AS sender_last_name,
    p.email AS sender_email
  FROM public.messages m
  JOIN public.profiles p ON p.id = m.sender_id
  WHERE m.conversation_id = p_conversation_id
    AND (
      -- User is admin (sees all)
      public.is_admin(auth.uid())
      -- User is member of conversation
      OR EXISTS (
        SELECT 1 FROM public.conversation_members cm
        WHERE cm.conversation_id = m.conversation_id
          AND cm.user_id = auth.uid()
      )
    )
  ORDER BY m.created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.list_messages_with_sender_v2(UUID, INT) TO authenticated;

-- ============================================================================
-- Verification Queries (commented out - for manual testing)
-- ============================================================================

-- Verify conversation types allowed
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.conversations'::regclass
--   AND conname = 'conversations_type_check';

-- Verify messages insert policy
-- SELECT polname, pg_get_expr(polqual, polrelid) as expression
-- FROM pg_policy
-- WHERE polrelid = 'public.messages'::regclass
--   AND polname = 'messages_insert_allowed';

-- Verify subject column exists
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'messages' AND column_name = 'subject';

COMMIT;
