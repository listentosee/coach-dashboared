"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { deriveThreadGroups } from './utils'
import type {
  CoachConversation,
  CoachMessagingDataSource,
  CoachMessage,
  MessagingSnapshot,
  ThreadGroup,
  ThreadSummary,
} from './types'
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
  threadSummaries: ThreadSummary[]
  refresh: () => Promise<void>
  setSnapshot: (snapshot: MessagingSnapshot) => void
  updateConversation: (conversationId: string, patch: Partial<CoachConversation>) => void
  updateMessage: (messageId: string, patch: Partial<CoachMessage>) => void
  removeConversation: (conversationId: string) => void
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

  // KISS: Fetch ALL messages for each conversation directly (no threading complexity)
  await Promise.all(
    conversations.map(async (conversation) => {
      try {
        const res = await fetch(`/api/messaging/conversations/${conversation.id}/messages?limit=500`)
        if (!res.ok) {
          messagesByConversation[conversation.id] = []
          return
        }
        const { messages = [] } = await res.json()
        const normalized = (messages as any[]).map((row) => ({
          id: `${row.id}`,
          conversation_id: conversation.id,
          sender_id: row.sender_id,
          body: row.body,
          created_at: row.created_at,
          parent_message_id: row.parent_message_id != null ? `${row.parent_message_id}` : null,
          sender_name: row.sender_name ?? null,
          sender_email: row.sender_email ?? null,
          read_at: row.read_at ?? null,
          flagged: row.flagged ?? false,
          archived_at: row.archived_at ?? null,
        })) as CoachMessage[]

        // Fetch read receipts
        const receiptLookup = await fetchReceiptsFor(normalized.map((m) => m.id))
        const annotated = receiptLookup.size === 0
          ? normalized
          : normalized.map((message) => (
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

async function fetchSnapshotFromApiV2(): Promise<{ snapshot: MessagingSnapshot; threadSummaries: ThreadSummary[] }> {
  const conversationsRes = await fetch('/api/messaging/conversations/summary')
  if (!conversationsRes.ok) throw new Error('Failed to load conversation summaries')
  const { conversations = [] } = await conversationsRes.json()

  const messagesRes = await fetch('/api/messaging/messages/recent?limitPerConversation=50')
  if (!messagesRes.ok) throw new Error('Failed to load recent messages')
  const { messages = [] } = await messagesRes.json()

  const threadSummaryRes = await fetch('/api/messaging/threads/summary?limit=1000')
  if (!threadSummaryRes.ok) throw new Error('Failed to load thread summaries')
  const { threads = [] } = await threadSummaryRes.json()

  const messagesByConversation: Record<string, CoachMessage[]> = {}
  for (const row of messages as any[]) {
    const conversationId = row.conversation_id
    if (!messagesByConversation[conversationId]) messagesByConversation[conversationId] = []
    messagesByConversation[conversationId].push({
      id: `${row.id}`,
      conversation_id: row.conversation_id,
      sender_id: row.sender_id,
      body: row.body,
      created_at: row.created_at,
      parent_message_id: row.parent_message_id != null ? `${row.parent_message_id}` : null,
      sender_name: row.sender_name ?? null,
      sender_email: row.sender_email ?? null,
      read_at: row.read_at ?? null,
      flagged: row.flagged ?? false,
      archived_at: row.archived_at ?? null,
      high_priority: row.high_priority ?? false,
    })
  }

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
        // ignore receipt fetch failures
      }
    }
    return map
  }

  const allRecentIds = Object.values(messagesByConversation).flat().map((m) => m.id)
  const receiptLookup = await fetchReceiptsFor(allRecentIds)
  if (receiptLookup.size > 0) {
    for (const list of Object.values(messagesByConversation)) {
      for (const message of list) {
        if (receiptLookup.has(message.id)) {
          message.read_at = receiptLookup.get(message.id) ?? message.read_at ?? null
        }
      }
    }
  }

  return { snapshot: { conversations, messagesByConversation }, threadSummaries: threads as ThreadSummary[] }
}

async function defaultDataSource(): Promise<MessagingSnapshot> {
  return fetchSnapshotFromApi()
}

export function useCoachMessagingData(options: UseCoachMessagingDataOptions = {}): CoachMessagingState {
  const {
    autoLoad = true,
    dataSource = defaultDataSource,
    mockOnError = false,
    mockSnapshot: overrideMock,
  } = options

  const [loading, setLoading] = useState<boolean>(autoLoad)
  const [error, setError] = useState<Error | null>(null)
  const [snapshot, setSnapshotState] = useState<MessagingSnapshot | null>(autoLoad ? null : { conversations: [], messagesByConversation: {} })
  const [threadSummaries, setThreadSummaries] = useState<ThreadSummary[]>([])
  const v2Enabled = useMemo(() => process.env.NEXT_PUBLIC_MESSAGING_V2 === 'true', [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (v2Enabled) {
        const { snapshot: next, threadSummaries: nextThreads } = await fetchSnapshotFromApiV2()
        setSnapshotState(next)
        setThreadSummaries(nextThreads)
      } else {
        const next = await dataSource()
        setSnapshotState(next)
      }
    } catch (err) {
      if (!v2Enabled && mockOnError && overrideMock) {
        setSnapshotState(overrideMock)
      }
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [dataSource, mockOnError, overrideMock, v2Enabled])

  useEffect(() => {
    if (!autoLoad) return
    void refresh()
  }, [autoLoad, refresh])

  // Subscribe to all new messages for the current user
  useEffect(() => {
    if (!snapshot) return

    let refreshTimer: NodeJS.Timeout | null = null

    // Subscribe to any new message in conversations the user is a member of
    // This catches DMs, groups, and announcement replies that create new conversations
    const channel = supabase
      .channel('coach-all-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        () => {
          // Debounce refresh to avoid race conditions with send operations
          if (refreshTimer) clearTimeout(refreshTimer)
          refreshTimer = setTimeout(() => {
            void refresh()
          }, 300)
        },
      )
      .subscribe()

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer)
      supabase.removeChannel(channel)
    }
  }, [refresh, snapshot])

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

  const updateConversation = useCallback((conversationId: string, patch: Partial<CoachConversation>) => {
    setSnapshotState((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        conversations: prev.conversations.map((c) =>
          c.id === conversationId ? { ...c, ...patch } : c
        ),
      }
    })
  }, [])

  const updateMessage = useCallback((messageId: string, patch: Partial<CoachMessage>) => {
    setSnapshotState((prev) => {
      if (!prev) return prev
      const nextMessages = { ...prev.messagesByConversation }
      for (const [convId, messages] of Object.entries(nextMessages)) {
        const idx = messages.findIndex((m) => m.id === messageId)
        if (idx !== -1) {
          nextMessages[convId] = messages.map((m) =>
            m.id === messageId ? { ...m, ...patch } : m
          )
          break
        }
      }
      return { ...prev, messagesByConversation: nextMessages }
    })
  }, [])

  const removeConversation = useCallback((conversationId: string) => {
    setSnapshotState((prev) => {
      if (!prev) return prev
      const { [conversationId]: _, ...restMessages } = prev.messagesByConversation
      return {
        conversations: prev.conversations.filter((c) => c.id !== conversationId),
        messagesByConversation: restMessages,
      }
    })
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
    threadSummaries,
    refresh,
    setSnapshot,
    updateConversation,
    updateMessage,
    removeConversation,
    subscribeToConversation,
    subscribeToThread,
  }
}
