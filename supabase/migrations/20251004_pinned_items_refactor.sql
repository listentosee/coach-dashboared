-- Drop old pin columns from conversation_members
ALTER TABLE public.conversation_members
  DROP COLUMN IF EXISTS pinned,
  DROP COLUMN IF EXISTS pinned_at;

-- Create pinned_items table to track individual message and conversation pins
CREATE TABLE IF NOT EXISTS public.pinned_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id BIGINT REFERENCES public.messages(id) ON DELETE CASCADE,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint: user can only pin a specific message or conversation once
  UNIQUE(user_id, conversation_id, message_id)
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_pinned_items_user_pinned_at ON public.pinned_items(user_id, pinned_at DESC);
CREATE INDEX IF NOT EXISTS idx_pinned_items_conversation ON public.pinned_items(conversation_id);
CREATE INDEX IF NOT EXISTS idx_pinned_items_message ON public.pinned_items(message_id) WHERE message_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.pinned_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own pinned items"
  ON public.pinned_items
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own pinned items"
  ON public.pinned_items
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own pinned items"
  ON public.pinned_items
  FOR DELETE
  USING (auth.uid() = user_id);

-- Function to pin a message
CREATE OR REPLACE FUNCTION public.pin_message(
  p_conversation_id UUID,
  p_message_id BIGINT
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID;
  v_pin_count INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check pin limit (10 total pins)
  SELECT COUNT(*) INTO v_pin_count
  FROM public.pinned_items
  WHERE user_id = v_user_id;

  IF v_pin_count >= 10 THEN
    RAISE EXCEPTION 'Maximum 10 pinned items allowed';
  END IF;

  -- Insert pin (message_id is set, so this is a message pin)
  INSERT INTO public.pinned_items (user_id, conversation_id, message_id)
  VALUES (v_user_id, p_conversation_id, p_message_id)
  ON CONFLICT (user_id, conversation_id, message_id) DO NOTHING;
END;
$$;

-- Function to pin a conversation
CREATE OR REPLACE FUNCTION public.pin_conversation_v2(
  p_conversation_id UUID
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID;
  v_pin_count INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check pin limit (10 total pins)
  SELECT COUNT(*) INTO v_pin_count
  FROM public.pinned_items
  WHERE user_id = v_user_id;

  IF v_pin_count >= 10 THEN
    RAISE EXCEPTION 'Maximum 10 pinned items allowed';
  END IF;

  -- Insert pin (message_id is NULL, so this is a conversation pin)
  INSERT INTO public.pinned_items (user_id, conversation_id, message_id)
  VALUES (v_user_id, p_conversation_id, NULL)
  ON CONFLICT (user_id, conversation_id, message_id) DO NOTHING;
END;
$$;

-- Function to unpin a message
CREATE OR REPLACE FUNCTION public.unpin_message(
  p_conversation_id UUID,
  p_message_id BIGINT
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.pinned_items
  WHERE user_id = v_user_id
    AND conversation_id = p_conversation_id
    AND message_id = p_message_id;
END;
$$;

-- Function to unpin a conversation
CREATE OR REPLACE FUNCTION public.unpin_conversation_v2(
  p_conversation_id UUID
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.pinned_items
  WHERE user_id = v_user_id
    AND conversation_id = p_conversation_id
    AND message_id IS NULL;
END;
$$;

-- Function to get pinned items for a user
CREATE OR REPLACE FUNCTION public.get_pinned_items(
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  conversation_id UUID,
  message_id BIGINT,
  pinned_at TIMESTAMPTZ,
  is_message_pin BOOLEAN
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    pi.id,
    pi.conversation_id,
    pi.message_id,
    pi.pinned_at,
    (pi.message_id IS NOT NULL) AS is_message_pin
  FROM public.pinned_items pi
  WHERE pi.user_id = v_user_id
  ORDER BY pi.pinned_at DESC;
END;
$$;

-- Drop old pin/unpin functions
DROP FUNCTION IF EXISTS public.pin_conversation(UUID);
DROP FUNCTION IF EXISTS public.unpin_conversation(UUID);
