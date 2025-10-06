-- Fix archive_conversation to remove references to deleted pinned columns

DROP FUNCTION IF EXISTS public.archive_conversation(UUID);

CREATE OR REPLACE FUNCTION public.archive_conversation(
  p_conversation_id UUID
)
RETURNS VOID
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Archive the conversation
  UPDATE public.conversation_members
  SET archived_at = NOW()
  WHERE conversation_id = p_conversation_id AND user_id = v_user_id;

  -- Also remove any pinned items for this conversation
  DELETE FROM public.pinned_items
  WHERE conversation_id = p_conversation_id AND user_id = v_user_id;
END;
$$;
