-- Phase 1: Critical Fixes for Coach Messaging (REVISED)
-- Date: October 4, 2025
-- Description: Fix reply 403 error only (KISS - use conversation.title, not message.subject)

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
-- 2. Clean Up - Remove subject field if it was added
-- ============================================================================

-- Remove subject column if it exists (reverting previous migration)
ALTER TABLE public.messages DROP COLUMN IF EXISTS subject;

-- Drop the index if it exists
DROP INDEX IF EXISTS public.idx_messages_subject;

-- ============================================================================
-- DECISION: Use conversation.title as the subject
-- No per-message subjects needed - keeps it simple (KISS)
-- UI will display conversation.title as the message subject
-- ============================================================================

COMMIT;
