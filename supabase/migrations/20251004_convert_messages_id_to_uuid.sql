-- Migration to convert messages.id from BIGINT to UUID
-- This is safe for development environments where we can clear data

-- Step 1: Drop views that depend on messages table
DROP VIEW IF EXISTS public.v_messages_with_sender;

-- Step 2: Drop RLS policies that depend on messages.id
DROP POLICY IF EXISTS "Users can create their own read receipts" ON public.message_read_receipts;
DROP POLICY IF EXISTS "Users can view read receipts in their conversations" ON public.message_read_receipts;

-- Step 3: Drop all foreign key constraints that reference messages.id
ALTER TABLE public.message_read_receipts DROP CONSTRAINT IF EXISTS message_read_receipts_message_id_fkey;
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_parent_message_id_fkey;
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_thread_root_id_fkey;

-- Step 3: Clear all data from tables (acceptable in development)
TRUNCATE TABLE public.message_read_receipts CASCADE;
TRUNCATE TABLE public.messages CASCADE;

-- Step 4: Convert messages.id from BIGINT IDENTITY to UUID
-- First, drop the IDENTITY property (can't convert IDENTITY column to non-numeric type)
ALTER TABLE public.messages
  ALTER COLUMN id DROP IDENTITY IF EXISTS;

-- Now convert to UUID
ALTER TABLE public.messages
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE UUID USING gen_random_uuid(),
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.messages
  ALTER COLUMN parent_message_id TYPE UUID USING NULL;

ALTER TABLE public.messages
  ALTER COLUMN thread_root_id TYPE UUID USING NULL;

-- Step 4: Convert message_read_receipts.message_id to UUID
ALTER TABLE public.message_read_receipts
  ALTER COLUMN message_id TYPE UUID USING NULL;

-- Step 5: Recreate all foreign key constraints
ALTER TABLE public.message_read_receipts
  ADD CONSTRAINT message_read_receipts_message_id_fkey
  FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_parent_message_id_fkey
  FOREIGN KEY (parent_message_id) REFERENCES public.messages(id) ON DELETE SET NULL;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_thread_root_id_fkey
  FOREIGN KEY (thread_root_id) REFERENCES public.messages(id) ON DELETE SET NULL;

-- Step 6: Drop the old BIGINT sequence
DROP SEQUENCE IF EXISTS public.messages_id_seq;

-- Step 7: Recreate the v_messages_with_sender view with UUID
CREATE OR REPLACE VIEW public.v_messages_with_sender
WITH (security_invoker='on') AS
SELECT
  m.id,
  m.conversation_id,
  m.sender_id,
  m.body,
  m.created_at,
  p.first_name,
  p.last_name,
  p.email
FROM public.messages m
JOIN public.profiles p ON p.id = m.sender_id;

-- Grant permissions on the recreated view
GRANT SELECT, INSERT, REFERENCES, DELETE, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_messages_with_sender TO anon;
GRANT SELECT, INSERT, REFERENCES, DELETE, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_messages_with_sender TO authenticated;
GRANT SELECT, INSERT, REFERENCES, DELETE, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_messages_with_sender TO service_role;

-- Step 8: Recreate RLS policies on message_read_receipts
CREATE POLICY "Users can create their own read receipts"
  ON public.message_read_receipts
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.messages m
      JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
      WHERE m.id = message_read_receipts.message_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view read receipts in their conversations"
  ON public.message_read_receipts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.messages m
      JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
      WHERE m.id = message_read_receipts.message_id
        AND cm.user_id = auth.uid()
    )
  );
