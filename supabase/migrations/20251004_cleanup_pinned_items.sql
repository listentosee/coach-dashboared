-- Cleanup migration to remove any partially-created pinned_items objects
-- Run this before the main pinned_items migration

-- Drop functions
DROP FUNCTION IF EXISTS public.get_pinned_items(UUID);
DROP FUNCTION IF EXISTS public.unpin_conversation_v2(UUID);
DROP FUNCTION IF EXISTS public.unpin_message(UUID, UUID);
DROP FUNCTION IF EXISTS public.pin_conversation_v2(UUID);
DROP FUNCTION IF EXISTS public.pin_message(UUID, UUID);

-- Drop policies
DROP POLICY IF EXISTS "Users can delete their own pinned items" ON public.pinned_items;
DROP POLICY IF EXISTS "Users can insert their own pinned items" ON public.pinned_items;
DROP POLICY IF EXISTS "Users can view their own pinned items" ON public.pinned_items;

-- Drop indexes
DROP INDEX IF EXISTS public.idx_pinned_items_message;
DROP INDEX IF EXISTS public.idx_pinned_items_conversation;
DROP INDEX IF EXISTS public.idx_pinned_items_user_pinned_at;

-- Drop table
DROP TABLE IF EXISTS public.pinned_items;
