"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { deriveThreadGroups } from './utils'
import type {
  CoachConversation,
  CoachMessagingDataSource,
  CoachMessage,
  MessagingSnapshot,
  ThreadGroup,
} from './types'
import { cloneMockSnapshot, mockSnapshot } from './mock-data'
import { supabase } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

type UseCoachMessagingDataOptions = {
  autoLoad?: boolean
  dataSource?: CoachMessagingDataSource
  mockOnError?: boolean
  mockSnapshot?: MessagingSnapshot
}

type CoachMessagingState = {
  loading: boolean
  error: Error | null
  conversations: CoachConversation[]
  messagesByConversation: Record<string, CoachMessage[]>
  threadGroupsByConversation: Record<string, ThreadGroup[]>
  refresh: () => Promise<void>
  setSnapshot: (snapshot: MessagingSnapshot) => void
  subscribeToConversation: (conversationId: string) => (() => void) | void
  subscribeToThread: (conversationId: string, threadId: string) => (() => void) | void
}

async function fetchSnapshotFromApi(): Promise<MessagingSnapshot> {
  const conversationsRes = await fetch('/api/messaging/conversations')
  if (!conversationsRes.ok) throw new Error('Failed to load conversations')
  const { conversations = [] } = await conversationsRes.json()

  const messagesByConversation: Record<string, CoachMessage[]> = {}

  const fetchReceiptsFor = async (messageIds: string[]): Promise<Map<string, string>> => {
    const map = new Map<string, string>()
    if (messageIds.length === 0) return map
    const chunkSize = 100
    for (let i = 0; i < messageIds.length; i += chunkSize) {
      const chunk = messageIds.slice(i, i + chunkSize)
      const params = new URLSearchParams({ messageIds: chunk.join(',') })
      try {
        const res = await fetch(`/api/messaging/read-receipts?${params.toString()}`)
        if (!res.ok) continue
        const { receipts = [] } = await res.json() as { receipts?: Array<{ message_id: number | string; read_at: string }> }
        for (const receipt of receipts) {
          if (!receipt?.message_id || !receipt.read_at) continue
          map.set(`${receipt.message_id}`, receipt.read_at)
        }
      } catch {
        // ignore receipt fetch failures; messages stay unread until next refresh
      }
    }
    return map
  }

  await Promise.all(
    conversations.map(async (conversation) => {
      try {
        const threadsRes = await fetch(`/api/messaging/conversations/${conversation.id}/threads?limit=200`)
        if (!threadsRes.ok) {
          messagesByConversation[conversation.id] = []
          return
        }
        const { threads = [] } = await threadsRes.json()
        const threadMessages = await Promise.all(
          (threads as any[]).map(async (thread) => {
            try {
              const res = await fetch(`/api/messaging/threads/${thread.root_id}`)
              if (!res.ok) return []
              const { messages = [] } = await res.json()
              return (messages as any[]).map((row) => ({
                id: `${row.id}`,
                conversation_id: conversation.id,
                sender_id: row.sender_id,
                body: row.body,
                created_at: row.created_at,
                parent_message_id: row.parent_message_id != null ? `${row.parent_message_id}` : null,
                sender_name: row.sender_name ?? null,
                sender_email: row.sender_email ?? null,
                read_at: row.read_at ?? null,
              })) as CoachMessage[]
            } catch {
              return []
            }
          }),
        )
        const flattened = threadMessages.flat().sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        const receiptLookup = await fetchReceiptsFor(flattened.map((message) => message.id))
        const annotated = receiptLookup.size === 0
          ? flattened
          : flattened.map((message) => (
            receiptLookup.has(message.id)
              ? { ...message, read_at: receiptLookup.get(message.id) ?? message.read_at ?? null }
              : message
          ))
        messagesByConversation[conversation.id] = annotated
      } catch {
        messagesByConversation[conversation.id] = []
      }
    }),
  )

  return { conversations, messagesByConversation }
}

async function defaultDataSource(): Promise<MessagingSnapshot> {
  try {
    return await fetchSnapshotFromApi()
  } catch (err) {
    console.error('Coach messaging data fetch failed, falling back to mock snapshot', err)
    return cloneMockSnapshot()
  }
}

export function useCoachMessagingData(options: UseCoachMessagingDataOptions = {}): CoachMessagingState {
  const {
    autoLoad = true,
    dataSource = defaultDataSource,
    mockOnError = true,
    mockSnapshot: overrideMock = mockSnapshot,
  } = options

  const [loading, setLoading] = useState<boolean>(autoLoad)
  const [error, setError] = useState<Error | null>(null)
  const [snapshot, setSnapshotState] = useState<MessagingSnapshot | null>(autoLoad ? null : cloneMockSnapshot())

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await dataSource()
      setSnapshotState(next)
    } catch (err) {
      if (mockOnError && overrideMock) {
        setSnapshotState(cloneMockSnapshot())
      }
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [dataSource, mockOnError, overrideMock])

  useEffect(() => {
    if (!autoLoad) return
    void refresh()
  }, [autoLoad, refresh])

  const conversations = useMemo(() => snapshot?.conversations ?? [], [snapshot])
  const messagesByConversation = useMemo(() => snapshot?.messagesByConversation ?? {}, [snapshot])

  const threadGroupsByConversation = useMemo(() => {
    const groups: Record<string, ThreadGroup[]> = {}
    for (const conversation of conversations) {
      const list = messagesByConversation[conversation.id] ?? []
      groups[conversation.id] = deriveThreadGroups(list)
    }
    return groups
  }, [conversations, messagesByConversation])

  const setSnapshot = useCallback((next: MessagingSnapshot) => {
    setSnapshotState(next)
  }, [])

  const subscriptionsRef = useRef<{
    conversations: Map<string, RealtimeChannel>
    threads: Map<string, { messages: RealtimeChannel; receipts: RealtimeChannel }>
  }>({
    conversations: new Map(),
    threads: new Map(),
  })

  const subscribeToConversation = useCallback((conversationId: string) => {
    if (!conversationId) return () => {}
    if (subscriptionsRef.current.conversations.has(conversationId)) return () => {}
    const channel = supabase
      .channel(`coach-msgs-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          void refresh()
        },
      )
      .subscribe()

    subscriptionsRef.current.conversations.set(conversationId, channel)

    return () => {
      const existing = subscriptionsRef.current.conversations.get(conversationId)
      if (existing) {
        supabase.removeChannel(existing)
        subscriptionsRef.current.conversations.delete(conversationId)
      }
    }
  }, [refresh])

  const subscribeToThread = useCallback((conversationId: string, threadId: string) => {
    if (!conversationId || !threadId) return () => {}
    const key = `${conversationId}-${threadId}`
    if (subscriptionsRef.current.threads.has(key)) return () => {}

    const messageChannel = supabase
      .channel(`coach-thread-${conversationId}-${threadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row: any = payload.new
          const root = row.thread_root_id != null ? `${row.thread_root_id}` : `${row.id}`
          if (root === threadId) {
            void refresh()
          }
        },
      )
      .subscribe()

    const receiptChannel = supabase
      .channel(`coach-receipts-${conversationId}-${threadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_read_receipts',
        },
        () => {
          void refresh()
        },
      )
      .subscribe()

    subscriptionsRef.current.threads.set(key, { messages: messageChannel, receipts: receiptChannel })

    return () => {
      const existing = subscriptionsRef.current.threads.get(key)
      if (existing) {
        supabase.removeChannel(existing.messages)
        supabase.removeChannel(existing.receipts)
        subscriptionsRef.current.threads.delete(key)
      }
    }
  }, [refresh])

  useEffect(() => {
    const store = subscriptionsRef.current
    return () => {
      for (const channel of store.conversations.values()) {
        supabase.removeChannel(channel)
      }
      for (const pair of store.threads.values()) {
        supabase.removeChannel(pair.messages)
        supabase.removeChannel(pair.receipts)
      }
      store.conversations.clear()
      store.threads.clear()
    }
  }, [])

  return {
    loading,
    error,
    conversations,
    messagesByConversation,
    threadGroupsByConversation,
    refresh,
    setSnapshot,
    subscribeToConversation,
    subscribeToThread,
  }
}
