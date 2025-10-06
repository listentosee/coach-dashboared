-- Add flagged column to messages and remove pinning infrastructure

-- Add flagged column to messages
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS flagged BOOLEAN DEFAULT FALSE;

-- Create index for efficient flagged queries
CREATE INDEX IF NOT EXISTS idx_messages_flagged ON public.messages(conversation_id, flagged) WHERE flagged = TRUE;

-- Drop pinning tables and functions
DROP TABLE IF EXISTS public.pinned_items CASCADE;
DROP FUNCTION IF EXISTS public.pin_message(UUID, UUID);
DROP FUNCTION IF EXISTS public.pin_conversation_v2(UUID);
DROP FUNCTION IF EXISTS public.unpin_message(UUID, UUID);
DROP FUNCTION IF EXISTS public.unpin_conversation_v2(UUID);
DROP FUNCTION IF EXISTS public.get_pinned_items(UUID);

-- Function to toggle message flag
CREATE OR REPLACE FUNCTION public.toggle_message_flag(
  p_message_id UUID,
  p_flagged BOOLEAN
)
RETURNS VOID
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify user is member of conversation
  IF NOT EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
    WHERE m.id = p_message_id AND cm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.messages
  SET flagged = p_flagged
  WHERE id = p_message_id;
END;
$$;
