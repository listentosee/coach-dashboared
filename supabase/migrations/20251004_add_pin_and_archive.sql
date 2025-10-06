-- Add Pin and Archive functionality
-- Date: October 4, 2025
-- Description: Add per-user pin and archive state to conversation_members

BEGIN;

-- ============================================================================
-- 1. Add Pin and Archive columns
-- ============================================================================

ALTER TABLE public.conversation_members
  ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- ============================================================================
-- 2. Create indexes for efficient queries
-- ============================================================================

-- Index for pinned conversations (only index true values for efficiency)
CREATE INDEX IF NOT EXISTS idx_conversation_members_pinned
  ON public.conversation_members(user_id, pinned_at DESC)
  WHERE pinned = TRUE;

-- Index for archived conversations
CREATE INDEX IF NOT EXISTS idx_conversation_members_archived
  ON public.conversation_members(user_id, archived_at DESC)
  WHERE archived_at IS NOT NULL;

-- ============================================================================
-- 3. Pin/Unpin functions
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pin_conversation(
  p_conversation_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_pin_count INT;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if user is a member
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = p_conversation_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this conversation';
  END IF;

  -- Check pin limit (max 10)
  SELECT COUNT(*) INTO v_pin_count
  FROM public.conversation_members
  WHERE user_id = v_user_id AND pinned = TRUE;

  IF v_pin_count >= 10 THEN
    RAISE EXCEPTION 'Maximum 10 pinned conversations allowed';
  END IF;

  -- Pin the conversation
  UPDATE public.conversation_members
  SET pinned = TRUE, pinned_at = NOW()
  WHERE conversation_id = p_conversation_id AND user_id = v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.unpin_conversation(
  p_conversation_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
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

  -- Unpin the conversation
  UPDATE public.conversation_members
  SET pinned = FALSE, pinned_at = NULL
  WHERE conversation_id = p_conversation_id AND user_id = v_user_id;
END;
$$;

-- ============================================================================
-- 4. Archive/Unarchive functions
-- ============================================================================

CREATE OR REPLACE FUNCTION public.archive_conversation(
  p_conversation_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
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

  -- Archive the conversation (also unpin if pinned)
  UPDATE public.conversation_members
  SET archived_at = NOW(), pinned = FALSE, pinned_at = NULL
  WHERE conversation_id = p_conversation_id AND user_id = v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.unarchive_conversation(
  p_conversation_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
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

  -- Unarchive the conversation
  UPDATE public.conversation_members
  SET archived_at = NULL
  WHERE conversation_id = p_conversation_id AND user_id = v_user_id;
END;
$$;

-- ============================================================================
-- 5. Update list_conversations_enriched to include pin/archive fields
-- ============================================================================

DROP FUNCTION IF EXISTS public.list_conversations_enriched(UUID);

CREATE OR REPLACE FUNCTION public.list_conversations_enriched(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  type TEXT,
  title TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ,
  unread_count INTEGER,
  last_message_at TIMESTAMPTZ,
  display_title TEXT,
  pinned BOOLEAN,
  pinned_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH user_convos AS (
    SELECT
      c.id, c.type, c.title, c.created_by, c.created_at,
      cm.pinned, cm.pinned_at, cm.archived_at
    FROM public.conversations c
    JOIN public.conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = p_user_id
  ),
  last_msg AS (
    SELECT m.conversation_id, MAX(m.created_at) AS last_message_at
    FROM public.messages m
    JOIN user_convos uc ON uc.id = m.conversation_id
    GROUP BY m.conversation_id
  ),
  unread AS (
    SELECT uc.id AS conversation_id, COUNT(m.id)::INT AS unread_count
    FROM user_convos uc
    JOIN public.messages m ON m.conversation_id = uc.id AND m.sender_id <> p_user_id
    LEFT JOIN public.message_read_receipts r ON r.message_id = m.id AND r.user_id = p_user_id
    WHERE r.id IS NULL
    GROUP BY uc.id
  )
  SELECT
    uc.id,
    uc.type,
    uc.title,
    uc.created_by,
    uc.created_at,
    COALESCE(u.unread_count, 0) AS unread_count,
    lm.last_message_at,
    CASE
      WHEN uc.type = 'announcement' THEN COALESCE(NULLIF(TRIM(uc.title), ''), 'Announcement')
      WHEN uc.type = 'dm' THEN COALESCE(
        (
          SELECT NULLIF(TRIM(p.first_name || ' ' || p.last_name), '')
          FROM public.conversation_members cm
          JOIN public.profiles p ON p.id = cm.user_id
          WHERE cm.conversation_id = uc.id AND cm.user_id <> p_user_id
          LIMIT 1
        ),
        (
          SELECT p.email
          FROM public.conversation_members cm
          JOIN public.profiles p ON p.id = cm.user_id
          WHERE cm.conversation_id = uc.id AND cm.user_id <> p_user_id
          LIMIT 1
        ),
        'Direct Message'
      )
      WHEN uc.type = 'group' THEN COALESCE(
        NULLIF(TRIM(uc.title), ''),
        (
          SELECT STRING_AGG(COALESCE(NULLIF(TRIM(p.first_name || ' ' || p.last_name), ''), p.email), ', ')
          FROM public.conversation_members cm
          JOIN public.profiles p ON p.id = cm.user_id
          WHERE cm.conversation_id = uc.id AND cm.user_id <> p_user_id
        ),
        'Group Conversation'
      )
      ELSE uc.title
    END AS display_title,
    uc.pinned,
    uc.pinned_at,
    uc.archived_at
  FROM user_convos uc
  LEFT JOIN last_msg lm ON lm.conversation_id = uc.id
  LEFT JOIN unread u ON u.conversation_id = uc.id
  ORDER BY COALESCE(lm.last_message_at, uc.created_at) DESC;
$$;

-- ============================================================================
-- 6. Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.pin_conversation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unpin_conversation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_conversation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unarchive_conversation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_conversations_enriched(UUID) TO authenticated;

COMMIT;
