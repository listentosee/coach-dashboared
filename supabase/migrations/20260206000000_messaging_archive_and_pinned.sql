-- Migration: Create pinned_items table for per-user pin tracking
-- Required by /api/messaging/conversations/[id]/pin (calls pin_conversation_v2 / unpin_conversation_v2)
--
-- Archive is handled purely at the message level via message_user_state.archived_at.
-- A conversation is "archived" when ALL its messages are archived for that user.
-- A new message arriving (with no archived_at) automatically makes the conversation
-- appear in the inbox again — no triggers or RPCs needed.

-- ============================================================
-- 1. Create pinned_items table for per-user pin tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pinned_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- User can only pin a specific message or conversation once
  UNIQUE(user_id, conversation_id, message_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_pinned_items_user_pinned_at
  ON public.pinned_items(user_id, pinned_at DESC);
CREATE INDEX IF NOT EXISTS idx_pinned_items_conversation
  ON public.pinned_items(conversation_id);
CREATE INDEX IF NOT EXISTS idx_pinned_items_message
  ON public.pinned_items(message_id) WHERE message_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.pinned_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pinned_items' AND policyname = 'Users can view their own pinned items'
  ) THEN
    CREATE POLICY "Users can view their own pinned items"
      ON public.pinned_items FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pinned_items' AND policyname = 'Users can insert their own pinned items'
  ) THEN
    CREATE POLICY "Users can insert their own pinned items"
      ON public.pinned_items FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pinned_items' AND policyname = 'Users can delete their own pinned items'
  ) THEN
    CREATE POLICY "Users can delete their own pinned items"
      ON public.pinned_items FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================================
-- 3. Pin/Unpin RPC functions
-- ============================================================

-- Pin a message
CREATE OR REPLACE FUNCTION public.pin_message(
  p_conversation_id UUID,
  p_message_id UUID
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

  SELECT COUNT(*) INTO v_pin_count
  FROM public.pinned_items
  WHERE user_id = v_user_id;

  IF v_pin_count >= 10 THEN
    RAISE EXCEPTION 'Maximum 10 pinned items allowed';
  END IF;

  INSERT INTO public.pinned_items (user_id, conversation_id, message_id)
  VALUES (v_user_id, p_conversation_id, p_message_id)
  ON CONFLICT (user_id, conversation_id, message_id) DO NOTHING;
END;
$$;

-- Pin a conversation
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

  SELECT COUNT(*) INTO v_pin_count
  FROM public.pinned_items
  WHERE user_id = v_user_id;

  IF v_pin_count >= 10 THEN
    RAISE EXCEPTION 'Maximum 10 pinned items allowed';
  END IF;

  INSERT INTO public.pinned_items (user_id, conversation_id, message_id)
  VALUES (v_user_id, p_conversation_id, NULL)
  ON CONFLICT (user_id, conversation_id, message_id) DO NOTHING;
END;
$$;

-- Unpin a message
CREATE OR REPLACE FUNCTION public.unpin_message(
  p_conversation_id UUID,
  p_message_id UUID
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

-- Unpin a conversation
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

-- Get pinned items for a user
CREATE OR REPLACE FUNCTION public.get_pinned_items(
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  conversation_id UUID,
  message_id UUID,
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
