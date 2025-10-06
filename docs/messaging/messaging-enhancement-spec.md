# Messaging System Enhancement Specification
## Per-Message Read Receipts & Threading Support

**Document Version:** 1.0  
**Date:** January 2025  
**Project:** Coaches Dashboard Messaging System  
**Author:** System Architecture Team

---

## Executive Summary

This specification outlines the incremental enhancement of the existing messaging system to add:
1. **Per-message read receipts** - Track which users have read individual messages
2. **Message threading** - Enable replies to specific messages
3. **Performance optimizations** - Batch operations and efficient queries

All changes are designed to be **non-breaking** and can be rolled out incrementally with feature flags.

---

## 1. Current State Analysis

### 1.1 Existing Schema
- **conversations**: Stores conversation metadata
- **conversation_members**: Junction table with `last_read_at` timestamp
- **messages**: Linear message storage without threading
- **profiles**: User information

### 1.2 Limitations
- Read tracking only at conversation level via `last_read_at`
- No visibility into who has read specific messages
- No threading/reply capability
- Inefficient for showing "seen by" in group chats

---

## 2. Proposed Enhancements

### 2.1 Database Schema Changes

#### 2.1.1 Message Read Receipts Table

```sql
-- Migration: 20250115_add_message_read_receipts.sql

-- Create read receipts table
CREATE TABLE IF NOT EXISTS public.message_read_receipts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id bigint NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  -- Use auth.users as canonical user FK; join to profiles for names
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);

-- Performance indexes
CREATE INDEX idx_message_read_receipts_user ON public.message_read_receipts(user_id, read_at DESC);
-- Final: do NOT add a standalone (message_id) index. The UNIQUE(message_id,user_id)
-- constraint already supports message_id lookups; avoiding a redundant index keeps
-- write and storage overhead down.

-- Enable RLS
ALTER TABLE public.message_read_receipts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view read receipts in their conversations" 
  ON public.message_read_receipts
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
      WHERE m.id = message_read_receipts.message_id
      AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create their own read receipts" 
  ON public.message_read_receipts
  FOR INSERT 
  WITH CHECK (
    user_id = auth.uid() AND EXISTS (
      SELECT 1
      FROM public.messages m
      JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
      WHERE m.id = message_id AND cm.user_id = auth.uid()
    )
  );

-- No UPDATE allowed (read receipts are immutable)
-- DELETE only via CASCADE from messages table
```

#### 2.1.2 Threading Support

```sql
-- Migration: 20250115_add_message_threading.sql

-- Add threading columns to messages
ALTER TABLE public.messages 
  ADD COLUMN IF NOT EXISTS parent_message_id bigint REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS thread_root_id bigint REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS thread_reply_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS thread_last_reply_at timestamptz;

-- Indexes for threading
CREATE INDEX idx_messages_parent ON public.messages(parent_message_id) 
  WHERE parent_message_id IS NOT NULL;
CREATE INDEX idx_messages_thread_root ON public.messages(thread_root_id) 
  WHERE thread_root_id IS NOT NULL;
CREATE INDEX idx_messages_thread_activity ON public.messages(conversation_id, thread_last_reply_at DESC) 
  WHERE thread_root_id IS NULL AND thread_reply_count > 0;

-- Trigger to maintain thread statistics
CREATE OR REPLACE FUNCTION update_thread_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_message_id IS NOT NULL THEN
    -- Update parent message stats
    UPDATE public.messages 
    SET 
      thread_reply_count = thread_reply_count + 1,
      thread_last_reply_at = NEW.created_at
    WHERE id = NEW.parent_message_id;
    
    -- Set thread_root_id for nested replies
    SELECT COALESCE(thread_root_id, parent_message_id) 
    INTO NEW.thread_root_id
    FROM public.messages 
    WHERE id = NEW.parent_message_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_thread_stats
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION update_thread_stats();
-- Enforce replies stay in same conversation
CREATE OR REPLACE FUNCTION enforce_same_conversation()
RETURNS TRIGGER AS $$
DECLARE v_parent uuid; BEGIN
  IF NEW.parent_message_id IS NULL THEN RETURN NEW; END IF;
  SELECT conversation_id INTO v_parent FROM public.messages WHERE id = NEW.parent_message_id;
  IF v_parent IS NULL OR v_parent <> NEW.conversation_id THEN
    RAISE EXCEPTION 'Parent/child messages must share conversation';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_same_conversation
  BEFORE INSERT OR UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION enforce_same_conversation();
```

#### 2.1.3 Align With Current DB (from db_schema_dump.sql)

The current schema restricts `conversations.type` to `('dm','announcement')` and the messages insert policy to `'dm'` only. Apply the following to enable `'group'` and keep RLS correct:

```sql
-- Extend conversation types
ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_type_check;
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_type_check
  CHECK (type IN ('dm','group','announcement'));

-- Update messages insert policy to allow members in dm+group (admins anywhere)
DROP POLICY IF EXISTS messages_insert_allowed ON public.messages;
CREATE POLICY messages_insert_allowed ON public.messages
  FOR INSERT WITH CHECK (
    public.is_admin(auth.uid()) OR (
      EXISTS (
        SELECT 1 FROM public.conversation_members m
        WHERE m.conversation_id = messages.conversation_id
          AND m.user_id = auth.uid()
          AND (m.muted_until IS NULL OR m.muted_until < now())
      )
      AND (
        SELECT c.type FROM public.conversations c WHERE c.id = messages.conversation_id
      ) IN ('dm','group')
    )
  );
```

### 2.2 Database Functions

#### 2.2.1 Batch Read Marking

```sql
-- Migration: 20250115_add_read_functions.sql

-- Mark multiple messages as read (batch operation)
CREATE OR REPLACE FUNCTION public.mark_messages_read(
  p_message_ids bigint[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.message_read_receipts (message_id, user_id)
  SELECT unnest(p_message_ids), auth.uid()
  ON CONFLICT (message_id, user_id) DO NOTHING;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Get read status for multiple messages
CREATE OR REPLACE FUNCTION public.get_message_read_status(
  p_message_ids bigint[]
)
RETURNS TABLE (
  message_id bigint,
  read_count integer,
  readers jsonb
) 
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    m.id as message_id,
    COUNT(r.user_id)::integer as read_count,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'user_id', r.user_id,
          'read_at', r.read_at,
          'first_name', p.first_name,
          'last_name', p.last_name
        ) ORDER BY r.read_at DESC
      ) FILTER (WHERE r.user_id IS NOT NULL), 
      '[]'::jsonb
    ) as readers
  FROM unnest(p_message_ids) as m(id)
  JOIN public.messages msg ON msg.id = m.id
  JOIN public.conversation_members cm
    ON cm.conversation_id = msg.conversation_id AND cm.user_id = auth.uid()
  LEFT JOIN public.message_read_receipts r ON r.message_id = m.id
  LEFT JOIN public.profiles p ON p.id = r.user_id
  GROUP BY m.id;
$$;

-- Get unread message count per conversation (optimized)
CREATE OR REPLACE FUNCTION public.get_unread_counts(
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS TABLE (
  conversation_id uuid,
  unread_count integer,
  last_message_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH user_conversations AS (
    SELECT 
      cm.conversation_id,
      cm.last_read_at
    FROM public.conversation_members cm
    WHERE cm.user_id = p_user_id
  ),
  message_counts AS (
    SELECT 
      m.conversation_id,
      COUNT(*)::integer as unread_count,
      MAX(m.created_at) as last_message_at
    FROM public.messages m
    INNER JOIN user_conversations uc ON uc.conversation_id = m.conversation_id
    LEFT JOIN public.message_read_receipts r ON r.message_id = m.id AND r.user_id = p_user_id
    WHERE 
      m.sender_id != p_user_id
      AND r.id IS NULL
      AND m.created_at > uc.last_read_at
    GROUP BY m.conversation_id
  )
  SELECT 
    uc.conversation_id,
    COALESCE(mc.unread_count, 0) as unread_count,
    mc.last_message_at
  FROM user_conversations uc
  LEFT JOIN message_counts mc ON mc.conversation_id = uc.conversation_id;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.mark_messages_read(bigint[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_message_read_status(bigint[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unread_counts(uuid) TO authenticated;

-- Mark-all read using watermark semantics
CREATE OR REPLACE FUNCTION public.mark_conversation_read_v2(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_ts timestamptz; BEGIN
  SELECT MAX(created_at) INTO v_ts FROM public.messages WHERE conversation_id = p_conversation_id;
  UPDATE public.conversation_members cm
     SET last_read_at = GREATEST(COALESCE(v_ts, now()), cm.last_read_at)
   WHERE cm.conversation_id = p_conversation_id AND cm.user_id = auth.uid();
END; $$;

GRANT EXECUTE ON FUNCTION public.mark_conversation_read_v2(uuid) TO authenticated;
```

#### 2.2.2 Threading Functions

```sql
-- Migration: 20250115_add_threading_functions.sql

-- Get thread messages
CREATE OR REPLACE FUNCTION public.get_thread_messages(
  p_thread_root_id bigint
)
RETURNS TABLE (
  id bigint,
  sender_id uuid,
  body text,
  created_at timestamptz,
  parent_message_id bigint,
  sender_name text,
  sender_email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    m.id,
    m.sender_id,
    m.body,
    m.created_at,
    m.parent_message_id,
    p.first_name || ' ' || p.last_name as sender_name,
    p.email as sender_email
  FROM public.messages m
  JOIN public.profiles p ON p.id = m.sender_id
  WHERE (m.id = p_thread_root_id OR m.thread_root_id = p_thread_root_id)
  AND EXISTS (
    SELECT 1 FROM public.messages root
    JOIN public.conversation_members cm ON cm.conversation_id = root.conversation_id
    WHERE root.id = p_thread_root_id
    AND cm.user_id = auth.uid()
  )
  ORDER BY m.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_thread_messages(bigint) TO authenticated;
```

---

## 3. API Implementation

### 3.1 New API Endpoints

#### 3.1.1 Read Receipts Endpoints

```typescript
// app/api/messaging/read-receipts/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// POST /api/messaging/read-receipts
// Mark messages as read
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { messageIds } = await req.json() as { messageIds: number[] };
    
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return NextResponse.json({ error: 'Invalid message IDs' }, { status: 400 });
    }

    // Batch mark as read
    const { data, error } = await supabase.rpc('mark_messages_read', {
      p_message_ids: messageIds
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ 
      success: true, 
      marked_count: data 
    });

  } catch (error) {
    console.error('Read receipts error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/messaging/read-receipts?messageIds=1,2,3
// Get read status for messages
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const messageIds = req.nextUrl.searchParams.get('messageIds');
    if (!messageIds) {
      return NextResponse.json({ error: 'Message IDs required' }, { status: 400 });
    }

    const ids = messageIds.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    
    const { data, error } = await supabase.rpc('get_message_read_status', {
      p_message_ids: ids
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ readStatus: data });

  } catch (error) {
    console.error('Get read status error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

#### 3.1.2 Threading Endpoint

```typescript
// app/api/messaging/threads/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// GET /api/messaging/threads/[id]
// Get all messages in a thread
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const threadRootId = parseInt(params.id, 10);
    if (isNaN(threadRootId)) {
      return NextResponse.json({ error: 'Invalid thread ID' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('get_thread_messages', {
      p_thread_root_id: threadRootId
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ messages: data });

  } catch (error) {
    console.error('Thread fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

#### 3.1.3 Mark Conversation Read (watermark)

Use the new RPC to update the user’s `last_read_at` to the latest message in the conversation.

```typescript
// app/api/messaging/conversations/[id]/read/route.ts (updated)
import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.rpc('mark_conversation_read_v2', { p_conversation_id: params.id })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
```

### 3.2 React Components

#### 3.2.1 Enhanced Message Component with Read Receipts

```typescript
// components/messaging/message-with-receipts.tsx

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCheck, MessageSquare } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface MessageWithReceiptsProps {
  message: {
    id: number;
    sender_id: string;
    body: string;
    created_at: string;
    parent_message_id?: number;
    thread_reply_count?: number;
  };
  currentUserId: string;
  onReply?: (messageId: number) => void;
  enableReadReceipts?: boolean;
  enableThreading?: boolean;
}

export function MessageWithReceipts({
  message,
  currentUserId,
  onReply,
  enableReadReceipts = false,
  enableThreading = false
}: MessageWithReceiptsProps) {
  const [readers, setReaders] = useState<any[]>([]);
  const [showReaders, setShowReaders] = useState(false);
  const isOwnMessage = message.sender_id === currentUserId;

  useEffect(() => {
    if (enableReadReceipts && !isOwnMessage) {
      // Mark message as read when viewed
      markAsRead();
    }
    
    if (enableReadReceipts && isOwnMessage) {
      // Fetch read receipts for own messages
      fetchReadReceipts();
    }
  }, [message.id, enableReadReceipts, isOwnMessage]);

  const markAsRead = async () => {
    await fetch('/api/messaging/read-receipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageIds: [message.id] })
    });
  };

  const fetchReadReceipts = async () => {
    const response = await fetch(`/api/messaging/read-receipts?messageIds=${message.id}`);
    if (response.ok) {
      const { readStatus } = await response.json();
      if (readStatus?.[0]?.readers) {
        setReaders(readStatus[0].readers);
      }
    }
  };

  return (
    <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[70%] ${isOwnMessage ? 'order-2' : ''}`}>
        <div
          className={`rounded-lg p-3 ${
            isOwnMessage
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-900'
          }`}
        >
          <div className="text-sm">{message.body}</div>
          
          {/* Thread indicator */}
          {enableThreading && message.thread_reply_count > 0 && (
            <div className="mt-2 flex items-center gap-1 text-xs opacity-75">
              <MessageSquare className="h-3 w-3" />
              <span>{message.thread_reply_count} replies</span>
            </div>
          )}
        </div>

        {/* Message metadata */}
        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
          <span>{new Date(message.created_at).toLocaleTimeString()}</span>
          
          {/* Read receipts indicator */}
          {enableReadReceipts && isOwnMessage && readers.length > 0 && (
            <button
              onClick={() => setShowReaders(!showReaders)}
              className="flex items-center gap-1 hover:text-gray-700"
            >
              <CheckCheck className="h-3 w-3" />
              <span>{readers.length}</span>
            </button>
          )}
          
          {/* Reply button */}
          {enableThreading && onReply && (
            <button
              onClick={() => onReply(message.id)}
              className="hover:text-gray-700"
            >
              Reply
            </button>
          )}
        </div>

        {/* Read receipts details */}
        {showReaders && (
          <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
            <div className="font-medium mb-1">Read by:</div>
            {readers.map((reader: any) => (
              <div key={reader.user_id} className="text-gray-600">
                {reader.first_name} {reader.last_name} at{' '}
                {new Date(reader.read_at).toLocaleString()}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

#### 3.2.2 Thread View Component

```typescript
// components/messaging/thread-view.tsx

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';

interface ThreadViewProps {
  threadRootId: number;
  isOpen: boolean;
  onClose: () => void;
  onSendReply: (body: string, parentId: number) => void;
}

export function ThreadView({ 
  threadRootId, 
  isOpen, 
  onClose, 
  onSendReply 
}: ThreadViewProps) {
  const [messages, setMessages] = useState<any[]>([]);
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && threadRootId) {
      fetchThread();
    }
  }, [isOpen, threadRootId]);

  const fetchThread = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/messaging/threads/${threadRootId}`);
      if (response.ok) {
        const { messages } = await response.json();
        setMessages(messages);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendReply = () => {
    if (replyText.trim()) {
      onSendReply(replyText, threadRootId);
      setReplyText('');
      // Refresh thread
      setTimeout(fetchThread, 500);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Thread</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="text-center py-4">Loading thread...</div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`p-3 rounded-lg ${
                  msg.parent_message_id ? 'ml-6 bg-gray-50' : 'bg-gray-100'
                }`}
              >
                <div className="text-sm font-medium text-gray-700">
                  {msg.sender_name}
                </div>
                <div className="text-sm mt-1">{msg.body}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {new Date(msg.created_at).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t pt-4">
          <div className="flex gap-2">
            <Input
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Type your reply..."
              onKeyPress={(e) => e.key === 'Enter' && handleSendReply()}
            />
            <Button onClick={handleSendReply}>Send</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### 3.3 Feature Flags Implementation

```typescript
// lib/features.ts

interface FeatureFlags {
  messageReadReceipts: boolean;
  messageThreading: boolean;
  batchReadMarking: boolean;
  readReceiptsInGroupsOnly: boolean;
}

// Feature flags can be stored in environment variables or database
export const features: FeatureFlags = {
  messageReadReceipts: process.env.NEXT_PUBLIC_ENABLE_READ_RECEIPTS === 'true',
  messageThreading: process.env.NEXT_PUBLIC_ENABLE_THREADING === 'true',
  batchReadMarking: process.env.NEXT_PUBLIC_ENABLE_BATCH_READ === 'true',
  readReceiptsInGroupsOnly: process.env.NEXT_PUBLIC_READ_RECEIPTS_GROUPS_ONLY === 'true',
};

// Hook for feature flags
export function useFeature(feature: keyof FeatureFlags): boolean {
  return features[feature] || false;
}
```

---

## 4. Migration Strategy

### 4.1 Phase 1: Database Setup (Week 1)
1. Extend `conversations.type` CHECK to include `'group'`; update messages INSERT policy to allow members in `'dm'` and `'group'` (admins everywhere).
2. Deploy read receipts table and functions (with membership check + auth.users FK).
3. Deploy threading columns, integrity trigger (same‑conversation), and stats trigger.
4. Test with development environment
5. No UI changes yet

### 4.2 Phase 2: Silent Data Collection (Week 2)
1. Enable background read tracking
2. Start collecting read receipts data
3. Monitor performance impact
4. No visible UI changes

### 4.3 Phase 3: Gradual UI Rollout (Weeks 3-4)
1. Enable read receipts UI for admins only
2. Test in group conversations
3. Gather feedback
4. Enable for all users with feature flag

### 4.4 Phase 4: Threading (Weeks 5-6)
1. Enable reply button in UI
2. Test thread view component
3. Monitor usage patterns
4. Full rollout

---

## 5. Performance Considerations

### 5.1 Query Optimization
- Batch operations: Mark multiple messages as read in one RPC call (`mark_messages_read`).
- Targeted indexes: `(user_id, read_at DESC)` on receipts; avoid volatile time‑based partial indexes.
- Lazy loading: Only fetch receipts when the author hovers/clicks the indicator.
- Caching: Cache read status in component state for a few minutes.

### 5.2 Real-time Updates
```typescript
// Optimized real-time subscription
useEffect(() => {
  const channel = supabase
    .channel(`conversation-${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'message_read_receipts',
        filter: `message_id=in.(${visibleMessageIds.join(',')})`
      },
      handleReadReceiptUpdate
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [conversationId, visibleMessageIds]);
```

### 5.3 Database Maintenance
```sql
-- Weekly maintenance job to clean old read receipts
CREATE OR REPLACE FUNCTION cleanup_old_read_receipts()
RETURNS void AS $$
BEGIN
  DELETE FROM public.message_read_receipts
  WHERE read_at < now() - interval '30 days'
  AND message_id IN (
    SELECT id FROM public.messages
    WHERE created_at < now() - interval '30 days'
  );
END;
$$ LANGUAGE plpgsql;

-- Schedule with pg_cron or external scheduler
```

---

## 6. Testing Strategy

### 6.1 Unit Tests
```typescript
// __tests__/read-receipts.test.ts

describe('Read Receipts', () => {
  it('should mark messages as read in batch', async () => {
    const messageIds = [1, 2, 3];
    const result = await markMessagesAsRead(messageIds);
    expect(result.marked_count).toBe(3);
  });

  it('should not duplicate read receipts', async () => {
    const messageIds = [1, 1, 1];
    const result = await markMessagesAsRead(messageIds);
    expect(result.marked_count).toBe(1);
  });

  it('should return correct read status', async () => {
    const status = await getReadStatus([1]);
    expect(status[0].readers).toBeInstanceOf(Array);
  });
});
```

### 6.2 Integration Tests
- Test RLS policies with different user roles
- Test performance with 1000+ messages
- Test real-time updates with multiple users
- Test thread creation and retrieval

### 6.3 Load Testing
```javascript
// k6 load test script
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 }, // Ramp up
    { duration: '5m', target: 100 }, // Stay at 100 users
    { duration: '2m', target: 0 },   // Ramp down
  ],
};

export default function() {
  // Test batch read marking
  let response = http.post('https://yourapp.com/api/messaging/read-receipts', 
    JSON.stringify({ messageIds: [1, 2, 3, 4, 5] }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
}
```

---

## 7. Rollback Plan

### 7.1 Feature Flags
All features can be disabled instantly via environment variables without code deployment.

### 7.2 Database Rollback
```sql
-- Rollback script (if needed)
-- Note: This is destructive and should only be used in emergencies

-- Disable triggers
DROP TRIGGER IF EXISTS trigger_update_thread_stats ON public.messages;
DROP FUNCTION IF EXISTS update_thread_stats();

-- Remove threading columns (safe - just removes features)
ALTER TABLE public.messages 
  DROP COLUMN IF EXISTS parent_message_id,
  DROP COLUMN IF EXISTS thread_root_id,
  DROP COLUMN IF EXISTS thread_reply_count,
  DROP COLUMN IF EXISTS thread_last_reply_at;

-- Remove read receipts (preserves existing functionality)
DROP TABLE IF EXISTS public.message_read_receipts CASCADE;

-- Remove functions
DROP FUNCTION IF EXISTS public.mark_messages_read(bigint[]);
DROP FUNCTION IF EXISTS public.get_message_read_status(bigint[]);
DROP FUNCTION IF EXISTS public.get_thread_messages(bigint);
DROP FUNCTION IF EXISTS public.get_unread_counts(uuid);
```

---

## 8. Monitoring & Analytics

### 8.1 Key Metrics
- Read receipt creation rate
- Average time to read
- Thread creation rate
- Query performance (p50, p95, p99)
- Storage growth rate

### 8.2 Monitoring Queries
```sql
-- Monitor read receipt performance
SELECT 
  date_trunc('hour', read_at) as hour,
  COUNT(*) as receipts_created,
  AVG(EXTRACT(EPOCH FROM (read_at - m.created_at))) as avg_time_to_read_seconds
FROM public.message_read_receipts r
JOIN public.messages m ON m.id = r.message_id
WHERE read_at > now() - interval '24 hours'
GROUP BY hour
ORDER BY hour DESC;

-- Monitor thread usage
SELECT 
  date_trunc('day', created_at) as day,
  COUNT(*) FILTER (WHERE parent_message_id IS NOT NULL) as replies,
  COUNT(DISTINCT thread_root_id) as active_threads
FROM public.messages
WHERE created_at > now() - interval '7 days'
GROUP BY day;
```

---

## 9. Security Considerations

### 9.1 FERPA Compliance
- All read receipts respect existing RLS policies
- No user can see read receipts for conversations they're not part of
- Audit trail maintained for all read events
- Receipts are removed automatically when messages are deleted via
  `ON DELETE CASCADE` on `message_read_receipts.message_id` → `messages.id`.

### 9.2 Privacy Features
- Option to disable read receipts per user (future enhancement)
- Read receipts can be disabled globally via feature flag
- No retroactive read tracking for existing messages

---

## 10. Documentation for Developers

### 10.1 Quick Start
```bash
# 1. Run migrations
npm run migrate

# 2. Enable features
echo "NEXT_PUBLIC_ENABLE_READ_RECEIPTS=true" >> .env.local
echo "NEXT_PUBLIC_ENABLE_THREADING=true" >> .env.local

# 3. Test locally
npm run dev
```

### 10.2 API Reference
See Section 3.1 for complete API documentation.

### 10.3 Component Usage
```tsx
// Basic usage
<MessageWithReceipts
  message={message}
  currentUserId={userId}
  enableReadReceipts={true}
  enableThreading={true}
  onReply={handleReply}
/>

// Thread view
<ThreadView
  threadRootId={selectedThreadId}
  isOpen={threadOpen}
  onClose={() => setThreadOpen(false)}
  onSendReply={sendThreadReply}
/>
```

---

## 11. Timeline & Resources

### 11.1 Timeline
- **Week 1**: Database setup and testing
- **Week 2**: API implementation
- **Week 3**: UI components development
- **Week 4**: Integration and testing
- **Week 5**: Staged rollout
- **Week 6**: Full deployment

### 11.2 Resource Requirements
- 1 Backend Developer (40 hours)
- 1 Frontend Developer (40 hours)
- 1 QA Engineer (20 hours)
- Database storage: ~10-20% increase expected

---

## 12. Success Criteria

### 12.1 Technical Success
- [ ] Read receipts tracked with <100ms latency
- [ ] Thread loading in <200ms
- [ ] No degradation in message send performance
- [ ] Storage growth within 20% projection

### 12.2 User Success
- [ ] 80% of users view read receipts as valuable
- [ ] 50% of group conversations use threading
- [ ] No increase in support tickets
- [ ] Positive feedback from pilot users

---

## 13. Final Migration Checklist

- [ ] Extend `conversations.type` to include `'group'` (drop/add CHECK constraint).
- [ ] Replace `messages_insert_allowed` policy to allow members to post in `'dm'` and `'group'`; admins everywhere.
- [ ] Create `message_read_receipts` table (FK to `auth.users`, CASCADE) + index `(user_id, read_at DESC)` + RLS policies (membership on insert).
- [ ] Add threading columns and triggers (`update_thread_stats`, `enforce_same_conversation`).
- [ ] Deploy functions: `mark_messages_read`, `get_message_read_status` (membership filter), `get_unread_counts`, `mark_conversation_read_v2` (watermark).
- [ ] Update API: use `mark_conversation_read_v2` in `/conversations/:id/read`.
- [ ] UI: add IntersectionObserver batcher for receipts; thread view behind flag.
- [ ] Monitor: confirm receipt insert latency and unread query times; no redundant indexes.

---

## Appendix A: Complete SQL Migration File (updated to final decisions)

```sql
-- Complete migration file: 20250115_messaging_enhancements.sql
-- Run this entire file to add all enhancements

BEGIN;

-- 0. Enable 'group' type and update message insert policy
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_type_check;
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_type_check CHECK (type IN ('dm','group','announcement'));

DROP POLICY IF EXISTS messages_insert_allowed ON public.messages;
CREATE POLICY messages_insert_allowed ON public.messages
  FOR INSERT WITH CHECK (
    public.is_admin(auth.uid()) OR (
      EXISTS (
        SELECT 1 FROM public.conversation_members m
        WHERE m.conversation_id = messages.conversation_id
          AND m.user_id = auth.uid()
          AND (m.muted_until IS NULL OR m.muted_until < now())
      )
      AND (
        SELECT c.type FROM public.conversations c WHERE c.id = messages.conversation_id
      ) IN ('dm','group')
    )
  );

-- 1. Read Receipts Table
CREATE TABLE IF NOT EXISTS public.message_read_receipts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id bigint NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);

-- 2. Indexes for Read Receipts
CREATE INDEX idx_message_read_receipts_user ON public.message_read_receipts(user_id, read_at DESC);

-- 3. Enable RLS
ALTER TABLE public.message_read_receipts ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for Read Receipts
CREATE POLICY "Users can view read receipts in their conversations" 
  ON public.message_read_receipts
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
      WHERE m.id = message_read_receipts.message_id
      AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create their own read receipts" 
  ON public.message_read_receipts
  FOR INSERT 
  WITH CHECK (
    user_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
      WHERE m.id = message_id AND cm.user_id = auth.uid()
    )
  );

-- 5. Threading Support
ALTER TABLE public.messages 
  ADD COLUMN IF NOT EXISTS parent_message_id bigint REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS thread_root_id bigint REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS thread_reply_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS thread_last_reply_at timestamptz;

-- 6. Threading Indexes
CREATE INDEX idx_messages_parent ON public.messages(parent_message_id) 
  WHERE parent_message_id IS NOT NULL;
CREATE INDEX idx_messages_thread_root ON public.messages(thread_root_id) 
  WHERE thread_root_id IS NOT NULL;

-- 7. Thread Statistics Trigger
CREATE OR REPLACE FUNCTION update_thread_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_message_id IS NOT NULL THEN
    UPDATE public.messages 
    SET 
      thread_reply_count = thread_reply_count + 1,
      thread_last_reply_at = NEW.created_at
    WHERE id = NEW.parent_message_id;
    
    SELECT COALESCE(thread_root_id, parent_message_id) 
    INTO NEW.thread_root_id
    FROM public.messages 
    WHERE id = NEW.parent_message_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_thread_stats
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION update_thread_stats();

-- Integrity: ensure replies remain in the same conversation
CREATE OR REPLACE FUNCTION enforce_same_conversation()
RETURNS TRIGGER AS $$
DECLARE v_parent uuid; BEGIN
  IF NEW.parent_message_id IS NULL THEN RETURN NEW; END IF;
  SELECT conversation_id INTO v_parent FROM public.messages WHERE id = NEW.parent_message_id;
  IF v_parent IS NULL OR v_parent <> NEW.conversation_id THEN
    RAISE EXCEPTION 'Parent/child messages must share conversation';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_same_conversation
  BEFORE INSERT OR UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION enforce_same_conversation();

-- 6. Functions (subset)

-- mark_messages_read
CREATE OR REPLACE FUNCTION public.mark_messages_read(p_message_ids bigint[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int; BEGIN
  INSERT INTO public.message_read_receipts (message_id, user_id)
  SELECT unnest(p_message_ids), auth.uid()
  ON CONFLICT (message_id, user_id) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;

-- get_message_read_status (membership-aware)
CREATE OR REPLACE FUNCTION public.get_message_read_status(p_message_ids bigint[])
RETURNS TABLE (message_id bigint, read_count integer, readers jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id,
         COUNT(r.user_id)::int,
         COALESCE(jsonb_agg(jsonb_build_object(
           'user_id', r.user_id,
           'read_at', r.read_at,
           'first_name', p.first_name,
           'last_name', p.last_name
         ) ORDER BY r.read_at DESC) FILTER (WHERE r.user_id IS NOT NULL), '[]'::jsonb)
  FROM unnest(p_message_ids) AS m(id)
  JOIN public.messages msg ON msg.id = m.id
  JOIN public.conversation_members cm ON cm.conversation_id = msg.conversation_id AND cm.user_id = auth.uid()
  LEFT JOIN public.message_read_receipts r ON r.message_id = m.id
  LEFT JOIN public.profiles p ON p.id = r.user_id
  GROUP BY m.id;
$$;

-- get_unread_counts (unchanged from body above)
-- mark_conversation_read_v2 (watermark)
CREATE OR REPLACE FUNCTION public.mark_conversation_read_v2(p_conversation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ts timestamptz; BEGIN
  SELECT MAX(created_at) INTO v_ts FROM public.messages WHERE conversation_id = p_conversation_id;
  UPDATE public.conversation_members cm
     SET last_read_at = GREATEST(COALESCE(v_ts, now()), cm.last_read_at)
   WHERE cm.conversation_id = p_conversation_id AND cm.user_id = auth.uid();
END; $$;

COMMIT;
```

---

## Document Sign-off

**Prepared by:** System Architecture Team  
**Reviewed by:** _________________  
**Approved by:** _________________  
**Date:** _________________

---

*End of Specification Document*
