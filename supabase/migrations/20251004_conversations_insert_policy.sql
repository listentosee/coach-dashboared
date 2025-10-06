-- Fix: Allow authenticated users to create conversations
-- Date: October 4, 2025
-- Description: Add RLS policy to allow users to create DM and Group conversations

BEGIN;

-- Drop existing policy if it exists
DROP POLICY IF EXISTS conversations_insert_allowed ON public.conversations;

-- Allow authenticated users to create conversations
-- They can create 'dm' or 'group' conversations
-- Announcements can only be created by admins
CREATE POLICY conversations_insert_allowed ON public.conversations
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      type IN ('dm', 'group')
      OR (type = 'announcement' AND public.is_admin(auth.uid()))
    )
  );

COMMIT;
