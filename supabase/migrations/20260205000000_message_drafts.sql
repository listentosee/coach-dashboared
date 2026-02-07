-- Server-side drafts storage for messaging (FERPA-compliant)
CREATE TABLE IF NOT EXISTS public.message_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('dm','group','announcement','reply','forward')),
  body text NOT NULL DEFAULT '',
  subject text DEFAULT '',
  high_priority boolean NOT NULL DEFAULT false,
  dm_recipient_id uuid,
  group_recipient_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  thread_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_drafts_user_updated
  ON public.message_drafts (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_message_drafts_conversation
  ON public.message_drafts (conversation_id);

CREATE INDEX IF NOT EXISTS idx_message_drafts_thread
  ON public.message_drafts (thread_id);

CREATE OR REPLACE FUNCTION public.update_message_drafts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_message_drafts_updated_at ON public.message_drafts;
CREATE TRIGGER update_message_drafts_updated_at
BEFORE UPDATE ON public.message_drafts
FOR EACH ROW EXECUTE FUNCTION public.update_message_drafts_updated_at();

ALTER TABLE public.message_drafts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own drafts' AND tablename = 'message_drafts') THEN
    CREATE POLICY "Users can view their own drafts"
      ON public.message_drafts FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert their own drafts' AND tablename = 'message_drafts') THEN
    CREATE POLICY "Users can insert their own drafts"
      ON public.message_drafts FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update their own drafts' AND tablename = 'message_drafts') THEN
    CREATE POLICY "Users can update their own drafts"
      ON public.message_drafts FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete their own drafts' AND tablename = 'message_drafts') THEN
    CREATE POLICY "Users can delete their own drafts"
      ON public.message_drafts FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_drafts TO authenticated;
GRANT ALL ON public.message_drafts TO service_role;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS high_priority boolean NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.get_conversation_messages(uuid, integer);
DROP FUNCTION IF EXISTS public.get_conversation_messages_with_state(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_conversation_messages(
  p_conversation_id uuid,
  p_limit integer DEFAULT 500
)
RETURNS TABLE (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz,
  parent_message_id uuid,
  sender_name text,
  sender_email text,
  flagged boolean,
  high_priority boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    m.id,
    m.conversation_id,
    m.sender_id,
    m.body,
    m.created_at,
    m.parent_message_id,
    p.first_name || ' ' || p.last_name AS sender_name,
    p.email AS sender_email,
    COALESCE(mus.flagged, false) as flagged,
    m.high_priority
  FROM public.messages m
  JOIN public.profiles p ON p.id = m.sender_id
  LEFT JOIN public.message_user_state mus ON (
    mus.message_id = m.id AND mus.user_id = auth.uid()
  )
  WHERE m.conversation_id = p_conversation_id
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = p_conversation_id AND cm.user_id = auth.uid()
    )
  ORDER BY m.created_at DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.get_conversation_messages_with_state(
  p_conversation_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz,
  parent_message_id uuid,
  sender_name text,
  sender_email text,
  read_at timestamptz,
  flagged boolean,
  archived_at timestamptz,
  is_sender boolean,
  high_priority boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    m.id,
    m.conversation_id,
    m.sender_id,
    m.body,
    m.created_at,
    m.parent_message_id,
    p.first_name || ' ' || p.last_name AS sender_name,
    p.email AS sender_email,
    NULL::TIMESTAMPTZ as read_at,
    COALESCE(mus.flagged, false) as flagged,
    mus.archived_at,
    m.sender_id = COALESCE(p_user_id, auth.uid()) as is_sender,
    m.high_priority
  FROM public.messages m
  JOIN public.profiles p ON p.id = m.sender_id
  LEFT JOIN public.message_user_state mus ON (
    mus.message_id = m.id AND mus.user_id = COALESCE(p_user_id, auth.uid())
  )
  WHERE m.conversation_id = p_conversation_id
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = m.conversation_id
        AND cm.user_id = COALESCE(p_user_id, auth.uid())
    )
    AND (mus.archived_at IS NULL OR mus.user_id IS NULL)
  ORDER BY m.created_at ASC;
$$;

GRANT ALL ON FUNCTION public.get_conversation_messages(uuid, integer) TO anon;
GRANT ALL ON FUNCTION public.get_conversation_messages(uuid, integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_conversation_messages(uuid, integer) TO service_role;
GRANT ALL ON FUNCTION public.get_conversation_messages_with_state(uuid, uuid) TO anon;
GRANT ALL ON FUNCTION public.get_conversation_messages_with_state(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_conversation_messages_with_state(uuid, uuid) TO service_role;
