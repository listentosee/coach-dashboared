-- Fix: RLS policies and helper function for conversation creation
-- Date: October 4, 2025
-- Description: Add proper RLS policies and server function for creating conversations

BEGIN;

-- Enable RLS on conversations if not already enabled
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Drop and recreate all conversation policies
DROP POLICY IF EXISTS conversations_select_allowed ON public.conversations;
DROP POLICY IF EXISTS conversations_insert_allowed ON public.conversations;
DROP POLICY IF EXISTS conversations_update_allowed ON public.conversations;
DROP POLICY IF EXISTS conversations_delete_allowed ON public.conversations;

-- Allow users to view conversations they're members of
CREATE POLICY conversations_select_allowed ON public.conversations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversations.id
        AND cm.user_id = auth.uid()
    )
    OR public.is_admin(auth.uid())
  );

-- Allow authenticated users to create conversations via the helper function
CREATE POLICY conversations_insert_allowed ON public.conversations
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
  );

-- Allow admins or conversation creator to update
CREATE POLICY conversations_update_allowed ON public.conversations
  FOR UPDATE USING (
    public.is_admin(auth.uid())
    OR created_by = auth.uid()
  );

-- Allow admins or conversation creator to delete
CREATE POLICY conversations_delete_allowed ON public.conversations
  FOR DELETE USING (
    public.is_admin(auth.uid())
    OR created_by = auth.uid()
  );

-- Helper function to create a DM conversation with members
CREATE OR REPLACE FUNCTION public.create_dm_conversation(
  p_other_user_id UUID,
  p_title TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation_id UUID;
  v_current_user_id UUID;
BEGIN
  -- Get current user
  v_current_user_id := auth.uid();

  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_other_user_id IS NULL THEN
    RAISE EXCEPTION 'Other user ID is required';
  END IF;

  IF p_other_user_id = v_current_user_id THEN
    RAISE EXCEPTION 'Cannot create DM with self';
  END IF;

  -- Create conversation
  INSERT INTO public.conversations (type, title, created_by)
  VALUES ('dm', p_title, v_current_user_id)
  RETURNING id INTO v_conversation_id;

  -- Add both users as members
  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES
    (v_conversation_id, v_current_user_id),
    (v_conversation_id, p_other_user_id);

  RETURN v_conversation_id;
END;
$$;

-- Helper function to create a group conversation with members
-- Use p_user_ids to match existing function signature
CREATE OR REPLACE FUNCTION public.create_group_conversation(
  p_user_ids UUID[],
  p_title TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation_id UUID;
  v_current_user_id UUID;
  v_user_id UUID;
BEGIN
  -- Get current user
  v_current_user_id := auth.uid();

  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) = 0 THEN
    RAISE EXCEPTION 'At least one member is required';
  END IF;

  -- Create conversation
  INSERT INTO public.conversations (type, title, created_by)
  VALUES ('group', p_title, v_current_user_id)
  RETURNING id INTO v_conversation_id;

  -- Add all members (including creator)
  FOREACH v_user_id IN ARRAY p_user_ids
  LOOP
    INSERT INTO public.conversation_members (conversation_id, user_id)
    VALUES (v_conversation_id, v_user_id)
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN v_conversation_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.create_dm_conversation(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_group_conversation(UUID[], TEXT) TO authenticated;

COMMIT;
