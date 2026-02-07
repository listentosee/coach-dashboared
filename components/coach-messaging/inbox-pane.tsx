"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { InboxActionBar, InboxListMode, InboxViewMode, ConversationType } from './inbox-action-bar'
import { ThreadGroup } from './thread-group'
import { MessageListItem } from './message-list-item'
import { DraftActions } from './draft-actions'
import { ArchivedActions } from './archived-actions'
import { avatarColorForId, initialsForName, plainTextSnippet } from '@/lib/coach-messaging/utils'
import type { CoachConversation, CoachMessage, ThreadGroup as DerivedThreadGroup, ThreadSummary } from '@/lib/coach-messaging/types'
import { ArrowDownNarrowWide, ArrowUpNarrowWide, ArchiveRestore, BellOff, ChevronDown, Megaphone, MessageSquare, Pin, Search, Users, X } from 'lucide-react'
import { Input } from '@/components/ui/input'

const typeIconMap: Record<ConversationType, typeof MessageSquare> = {
  announcement: Megaphone,
  group: Users,
  dm: MessageSquare,
}

export type CoachInboxSelection = {
  conversation: CoachConversation
  message: CoachMessage
  threadId: string
  threadSubject: string | null
  threadMessages: CoachMessage[]
}

type SelectionState = {
  conversationId: string | null
  threadId: string | null
  messageId: string | null
}

export type PinnedItem = {
  id: string
  conversation_id: string
  message_id: string | null
  pinned_at: string
  is_message_pin: boolean
}

export type CoachDraftItem = {
  id: string
  title: string
  preview: string
  updatedAt: string
  conversationId?: string | null
  threadId?: string | null
  mode: 'dm' | 'group' | 'announcement' | 'reply' | 'forward'
}

export type CoachInboxPaneProps = {
  conversations: CoachConversation[]
  messagesByConversation: Record<string, CoachMessage[]>
  threadGroupsByConversation: Record<string, DerivedThreadGroup[]>
  threadSummaries?: ThreadSummary[]
  threadMessagesByRootId?: Record<string, CoachMessage[]>
  archivedConversations?: CoachConversation[]
  archivedMessagesByConversation?: Record<string, CoachMessage[]>
  onArchivedRestore?: (conversationId: string, messageId: string) => void
  onArchivedConversationRestore?: (conversationId: string) => void
  archivedLoading?: boolean
  loading?: boolean
  currentUserId?: string
  pinnedItems?: PinnedItem[]
  drafts?: CoachDraftItem[]
  draftsByThreadId?: Record<string, boolean>
  onDraftOpen?: (draftId: string) => void
  onDraftDelete?: (draftId: string) => void
  onThreadOpen?: (conversationId: string, rootId: string) => void
  onThreadExpand?: (conversationId: string, rootId: string, mode: 'thread' | 'conversation') => void
  v2Enabled?: boolean
  onSelectionChange?: (selection: CoachInboxSelection | null) => void
  onCompose?: (mode: 'dm' | 'group' | 'announcement') => void
  onMessagesRead?: (messageIds: string[]) => void
  subscribeToConversation?: (conversationId: string) => void
  onArchiveConversation?: (conversationId: string) => Promise<void>
  onFlagToggle?: (messageId: string, flagged: boolean) => Promise<void>
  onPinToggle?: (conversationId: string, pinned: boolean) => Promise<void>
  onMuteToggle?: (conversationId: string, muted: boolean) => Promise<void>
  onViewArchived?: () => void
  onRefresh?: () => Promise<void>
  isAdmin?: boolean
}

export function CoachInboxPane({
  conversations,
  messagesByConversation,
  threadGroupsByConversation,
  threadSummaries = [],
  loading = false,
  currentUserId = '',
  pinnedItems = [],
  drafts = [],
  draftsByThreadId = {},
  onDraftOpen,
  onDraftDelete,
  archivedConversations = [],
  archivedMessagesByConversation = {},
  onArchivedRestore,
  onArchivedConversationRestore,
  archivedLoading = false,
  onThreadOpen,
  onThreadExpand,
  threadMessagesByRootId = {},
  v2Enabled = false,
  onSelectionChange,
  onCompose,
  onMessagesRead,
  subscribeToConversation,
  onArchiveConversation,
  onFlagToggle,
  onPinToggle,
  onMuteToggle,
  onViewArchived,
  onRefresh,
  isAdmin = false,
}: CoachInboxPaneProps) {
  const [filters, setFilters] = useState<Record<ConversationType, boolean>>({ dm: true, group: true, announcement: true })
  const [viewMode, setViewMode] = useState<InboxViewMode>('all')
  const [listMode, setListMode] = useState<InboxListMode>('messages')
  const [showArchived, setShowArchived] = useState(false)
  const [expandedThreads, setExpandedThreads] = useState<Record<string, boolean>>({})
  const [selection, setSelection] = useState<SelectionState>({ conversationId: null, threadId: null, messageId: null })
  const [readMessageIds, setReadMessageIds] = useState<Set<string>>(new Set())
  const [pinnedCollapsed, setPinnedCollapsed] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [serverSearchResults, setServerSearchResults] = useState<Set<string> | null>(null)
  const [searching, setSearching] = useState(false)
  const [sortNewestFirst, setSortNewestFirst] = useState(true)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Debounced server-side search for full-text body matches
  const runServerSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setServerSearchResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    try {
      const scope = viewMode === 'archived' ? 'archived' : 'messages'
      const res = await fetch(`/api/messaging/search?q=${encodeURIComponent(query)}&scope=${scope}`)
      if (!res.ok) return
      const { results = [] } = await res.json()
      // Results contain conversation_id fields - collect them
      const ids = new Set<string>()
      for (const r of results) {
        if (r.conversation_id) ids.add(r.conversation_id)
        if (r.id) ids.add(`${r.id}`)
      }
      setServerSearchResults(ids)
    } catch {
      setServerSearchResults(null)
    } finally {
      setSearching(false)
    }
  }, [viewMode])

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    if (!value.trim()) {
      setServerSearchResults(null)
      setSearching(false)
      return
    }
    searchDebounceRef.current = setTimeout(() => {
      void runServerSearch(value)
    }, 300)
  }, [runServerSearch])

  const prevViewModeRef = useRef(viewMode)
  useEffect(() => {
    const prev = prevViewModeRef.current
    prevViewModeRef.current = viewMode
    // Refresh inbox data when leaving archived view to ensure clean state
    if (prev === 'archived' && viewMode !== 'archived') {
      void onRefresh?.()
    }
  }, [viewMode, onRefresh])

  useEffect(() => {
    if (viewMode === 'unread' && listMode !== 'messages') {
      setListMode('messages')
    }
  }, [viewMode, listMode])

  useEffect(() => {
    if (!subscribeToConversation) return
    for (const conversation of conversations) {
      subscribeToConversation(conversation.id)
    }
  }, [subscribeToConversation, conversations])

  useEffect(() => {
    setReadMessageIds((prev) => {
      const next = new Set(prev)
      for (const messages of Object.values(messagesByConversation)) {
        for (const message of messages) {
          if (message.sender_id === currentUserId || (message as any).read_at) {
            next.add(message.id)
          }
        }
      }
      return next
    })
  }, [messagesByConversation, currentUserId])

  const filteredConversations = useMemo(() => {
    // Exclude archived conversations unless in archived view
    const visible = conversations.filter((conversation) => {
      if (!filters[conversation.type]) return false
      if (viewMode !== 'archived' && conversation.all_archived) return false
      return true
    })
    let subset: CoachConversation[]
    if (viewMode === 'unread') {
      subset = visible.filter((conversation) => {
        const messages = messagesByConversation[conversation.id] ?? []
        return messages.some((message) => message.sender_id !== currentUserId && !readMessageIds.has(message.id))
      })
    } else if (viewMode === 'flagged') {
      subset = visible.filter((conversation) => {
        const messages = messagesByConversation[conversation.id] ?? []
        return messages.some((message) => message.flagged)
      })
    } else if (viewMode === 'drafts') {
      subset = visible
    } else {
      subset = visible
    }

    // Apply search filter (client-side on title/sender + server-side results)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      subset = subset.filter((conversation) => {
        // Client-side: match on title, display_title, sender name, or last message body
        const title = (conversation.title || conversation.display_title || '').toLowerCase()
        const lastSender = (conversation.last_sender_name || conversation.last_sender_email || '').toLowerCase()
        const lastBody = (conversation.last_message_body || '').toLowerCase()
        if (title.includes(query) || lastSender.includes(query) || lastBody.includes(query)) return true

        // Check messages for sender name and body matches
        const messages = messagesByConversation[conversation.id] ?? []
        const messageMatch = messages.some((m) => {
          const name = (m.sender_name || m.sender_email || '').toLowerCase()
          const body = (m.body || '').toLowerCase()
          return name.includes(query) || body.includes(query)
        })
        if (messageMatch) return true

        // Server-side results (deep body search)
        if (serverSearchResults?.has(conversation.id)) return true

        return false
      })
    }

    const direction = sortNewestFirst ? -1 : 1
    return [...subset].sort((a, b) => {
      const aDate = new Date(a.last_message_at || a.created_at).getTime()
      const bDate = new Date(b.last_message_at || b.created_at).getTime()
      return direction * (aDate - bDate)
    })
  }, [conversations, filters, viewMode, messagesByConversation, currentUserId, readMessageIds, searchQuery, serverSearchResults, sortNewestFirst])

  const pinnedConversationIds = useMemo(() => {
    return new Set(pinnedItems.filter((p) => !p.is_message_pin).map((p) => p.conversation_id))
  }, [pinnedItems])

  const pinnedConversations = useMemo(() => {
    if (viewMode !== 'all' || searchQuery.trim()) return []
    return filteredConversations.filter((c) => pinnedConversationIds.has(c.id))
  }, [filteredConversations, pinnedConversationIds, viewMode, searchQuery])

  const unpinnedConversations = useMemo(() => {
    if (viewMode !== 'all' || searchQuery.trim()) return filteredConversations
    return filteredConversations.filter((c) => !pinnedConversationIds.has(c.id))
  }, [filteredConversations, pinnedConversationIds, viewMode, searchQuery])

  const conversationMap = useMemo(() => {
    const map = new Map(conversations.map((conversation) => [conversation.id, conversation]))
    // Include archived conversations so titles resolve in the archived view
    for (const conv of archivedConversations) {
      if (!map.has(conv.id)) map.set(conv.id, conv)
    }
    return map
  }, [conversations, archivedConversations])

  const filteredConversationIds = useMemo(() => {
    return new Set(filteredConversations.map((c) => c.id))
  }, [filteredConversations])

  const v2ThreadEntries = useMemo(() => {
    if (!v2Enabled) return []
    const entries = threadSummaries.filter((summary) => {
      const conversation = conversationMap.get(summary.conversation_id)
      if (!conversation) return false
      if (!filters[conversation.type]) return false
      if (viewMode !== 'archived' && conversation.all_archived) return false
      if (viewMode === 'unread' && (summary.unread_count ?? 0) === 0) return false
      if (viewMode === 'flagged') return false
      // Respect search filter — only show threads whose conversation passed filtering
      if (searchQuery.trim() && !filteredConversationIds.has(summary.conversation_id)) return false
      return true
    })
    const direction = sortNewestFirst ? -1 : 1
    return entries.sort((a, b) => {
      const aDate = new Date(a.last_reply_at || a.created_at).getTime()
      const bDate = new Date(b.last_reply_at || b.created_at).getTime()
      return direction * (aDate - bDate)
    })
  }, [threadSummaries, conversationMap, filters, viewMode, v2Enabled, searchQuery, filteredConversationIds, sortNewestFirst])

  const handleToggleThread = (threadId: string) => {
    setExpandedThreads((prev) => ({ ...prev, [threadId]: !prev[threadId] }))
  }

  const emitSelection = (
    conversation: CoachConversation,
    message: CoachMessage,
    threadMessages: CoachMessage[],
    threadId: string,
    threadSubject: string | null,
  ) => {
    onSelectionChange?.({ conversation, message, threadMessages, threadId, threadSubject })
  }

  const handleMessageSelect = (
    conversation: CoachConversation,
    message: CoachMessage,
    threadMessages: CoachMessage[],
    threadId: string,
    threadSubject: string | null,
  ) => {
    setSelection({ conversationId: conversation.id, threadId, messageId: message.id })
    emitSelection(conversation, message, threadMessages, threadId, threadSubject)
    if (message.sender_id !== currentUserId && !readMessageIds.has(message.id)) {
      setReadMessageIds((prev) => {
        if (prev.has(message.id)) return prev
        const next = new Set(prev)
        next.add(message.id)
        return next
      })
      onMessagesRead?.([message.id])
    }
  }

  const resolveConversationTitle = (conversation: CoachConversation): string => {
    if (conversation.display_title && conversation.display_title.trim()) return conversation.display_title.trim()
    if (conversation.title && conversation.title.trim()) return conversation.title.trim()
    const messages = messagesByConversation[conversation.id] ?? archivedMessagesByConversation[conversation.id] ?? []
    if (conversation.type === 'dm') {
      const other = messages.find((message) => message.sender_id && message.sender_id !== currentUserId)
      return other?.sender_name || other?.sender_email || 'Direct Message'
    }
    if (conversation.type === 'group') return 'Group conversation'
    return 'Announcement'
  }

  const threadEntries = useMemo(() => {
    const entries: { conversation: CoachConversation; group: DerivedThreadGroup }[] = []
    for (const conversation of filteredConversations) {
      const groups = threadGroupsByConversation[conversation.id] ?? []

      // Find most recent group with messages
      let latestGroup: DerivedThreadGroup | null = null
      let latestTime = 0

      for (const group of groups) {
        if (group.messages.length === 0) continue
        if (viewMode === 'unread') {
          const hasUnread = group.messages.some(
            (message) => message.sender_id !== currentUserId && !readMessageIds.has(message.id),
          )
          if (!hasUnread) continue
        }

        const groupTime = new Date(group.lastActivityAt).getTime()
        if (groupTime > latestTime) {
          latestTime = groupTime
          latestGroup = group
        }
      }

      if (latestGroup) {
        entries.push({ conversation, group: latestGroup })
      }
    }
    const direction = sortNewestFirst ? -1 : 1
    return entries.sort((a, b) => direction * (new Date(a.group.lastActivityAt).getTime() - new Date(b.group.lastActivityAt).getTime()))
  }, [filteredConversations, threadGroupsByConversation, viewMode, currentUserId, readMessageIds, sortNewestFirst])

  const messageEntries = useMemo(() => {
    const entries: { conversation: CoachConversation; message: CoachMessage; group: DerivedThreadGroup | undefined }[] = []
    for (const conversation of filteredConversations) {
      const messages = [...(messagesByConversation[conversation.id] ?? [])]
      messages.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      // For threads view, show all messages; for messages view, show all messages from all conversations
      const messagesToShow = messages

      for (const message of messagesToShow) {
        const isUnread = message.sender_id !== currentUserId && !readMessageIds.has(message.id)
        if (viewMode === 'unread' && !isUnread) continue
        if (viewMode === 'flagged' && !message.flagged) continue
        if (message.archived_at) continue // Skip archived messages
        const rootId = message.parent_message_id ?? message.id
        const group = (threadGroupsByConversation[conversation.id] ?? []).find((candidate) => candidate.rootId === rootId)
        entries.push({ conversation, message, group })
      }
    }
    const direction = sortNewestFirst ? -1 : 1
    return entries.sort((a, b) => direction * (new Date(a.message.created_at).getTime() - new Date(b.message.created_at).getTime()))
  }, [filteredConversations, messagesByConversation, threadGroupsByConversation, viewMode, currentUserId, readMessageIds, sortNewestFirst])

  const totalUnreadCount = useMemo(() => {
    let count = 0
    for (const messages of Object.values(messagesByConversation)) {
      for (const message of messages) {
        if (message.sender_id !== currentUserId && !readMessageIds.has(message.id)) {
          count++
        }
      }
    }
    return count
  }, [messagesByConversation, currentUserId, readMessageIds])

  const isConversationMuted = useCallback((conversation: CoachConversation) => {
    if (!conversation.muted_until) return false
    return new Date(conversation.muted_until) > new Date()
  }, [])

  const listEmptyState = (() => {
    if (loading || (viewMode === 'archived' && archivedLoading)) return 'Loading messages…'
    if (searchQuery.trim()) return 'No results match your search.'
    if (viewMode === 'drafts') return 'No drafts saved yet.'
    if (viewMode === 'archived') return 'No archived messages.'
    return listMode === 'threads' ? 'No threads match the current filters.' : 'No messages match the current filters.'
  })()

  const selectedThreadId = selection.threadId
  const selectedMessageId = selection.messageId

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden rounded-md border border-meta-border bg-meta-card/10" data-testid="inbox-pane">
      <InboxActionBar
        listMode={listMode}
        onListModeChange={setListMode}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        filters={filters}
        onFiltersChange={setFilters}
        draftsCount={drafts.length}
        unreadCount={totalUnreadCount}
        onCompose={onCompose}
        onViewArchived={onViewArchived}
        isAdmin={isAdmin}
      />
      {/* Inline search + sort toggle */}
      <div className="flex items-center gap-1.5 border-b border-meta-border/50 px-3 py-2" data-testid="inbox-search">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-meta-muted pointer-events-none" />
          <Input
            ref={searchInputRef}
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="h-8 pl-8 pr-8 text-sm bg-slate-900/30 border-slate-700/50 text-slate-50 placeholder:text-slate-400"
            data-testid="inbox-search-input"
          />
          {searchQuery && !searching && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-meta-surface/50 text-meta-muted hover:text-meta-foreground transition-colors"
              onClick={() => handleSearchChange('')}
              title="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {searching && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-meta-muted border-t-transparent" />
            </div>
          )}
        </div>
        <button
          type="button"
          className="flex-shrink-0 rounded p-1.5 text-meta-muted hover:text-meta-foreground hover:bg-meta-surface/50 transition-colors"
          onClick={() => setSortNewestFirst((prev) => !prev)}
          title={sortNewestFirst ? 'Newest first (click for oldest first)' : 'Oldest first (click for newest first)'}
          data-testid="sort-toggle"
        >
          {sortNewestFirst
            ? <ArrowDownNarrowWide className="h-4 w-4" />
            : <ArrowUpNarrowWide className="h-4 w-4" />
          }
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {(loading || (viewMode === 'archived' && archivedLoading)) ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-meta-muted">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-meta-muted border-t-transparent" />
              Loading…
            </div>
          </div>
        ) : viewMode === 'drafts' ? (
          drafts.length === 0 ? (
            <div className="px-4 py-6 text-sm text-meta-muted">{listEmptyState}</div>
          ) : (
            <div className="space-y-1 px-4 py-3">
              {drafts.map((draft) => (
                  <MessageListItem
                    key={draft.id}
                    displayName={draft.title}
                    timestamp={new Date(draft.updatedAt).toLocaleString()}
                    preview={draft.preview}
                    avatarColorClass={avatarColorForId(draft.id)}
                    initials={'DR'}
                    onClick={() => onDraftOpen?.(draft.id)}
                    actions={onDraftDelete ? (
                      <DraftActions onDelete={() => onDraftDelete(draft.id)} />
                    ) : undefined}
                    detailFooter={
                      <div className="mt-1 inline-flex items-center rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-200">
                        Draft
                      </div>
                  }
                />
              ))}
            </div>
          )
        ) : viewMode === 'archived' ? (
          Object.keys(archivedMessagesByConversation).length === 0 ? (
            <div className="px-4 py-6 text-sm text-meta-muted">{listEmptyState}</div>
          ) : (
            <div className="space-y-3 px-4 py-3" data-testid="archived-list">
              {Object.entries(archivedMessagesByConversation)
                .sort(([, msgsA], [, msgsB]) => {
                  const latestA = Math.max(...(msgsA || []).map((m) => new Date(m.created_at).getTime()), 0)
                  const latestB = Math.max(...(msgsB || []).map((m) => new Date(m.created_at).getTime()), 0)
                  return (sortNewestFirst ? -1 : 1) * (latestA - latestB)
                })
                .map(([conversationId, messages]) => {
                const conversation = conversationMap.get(conversationId)
                const convTitle = conversation ? resolveConversationTitle(conversation) : 'Conversation'
                const sortedMessages = [...(messages || [])].sort((a, b) => {
                  return (sortNewestFirst ? -1 : 1) * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                })
                return (
                  <div key={conversationId} className="rounded-md border border-meta-border/50 bg-meta-card/20">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-meta-border/30">
                      <div className="text-xs font-medium text-meta-muted truncate">
                        {conversation?.type === 'dm' && `DM: ${convTitle}`}
                        {conversation?.type === 'group' && `Group: ${convTitle}`}
                        {conversation?.type === 'announcement' && `Announcement: ${convTitle}`}
                        {!conversation?.type && convTitle}
                        <span className="ml-2 text-meta-muted/60">({sortedMessages.length})</span>
                      </div>
                      {onArchivedConversationRestore && (
                        <button
                          type="button"
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-meta-muted hover:text-meta-foreground hover:bg-meta-surface/50 transition-colors"
                          onClick={() => onArchivedConversationRestore(conversationId)}
                          title="Restore entire conversation"
                          data-testid="restore-conversation"
                        >
                          <ArchiveRestore className="h-3.5 w-3.5" />
                          Restore
                        </button>
                      )}
                    </div>
                    <div className="space-y-1 p-1">
                      {sortedMessages.map((message) => (
                        <MessageListItem
                          key={`${message.conversation_id}-${message.id}`}
                          displayName={message.sender_name || message.sender_email || 'Unknown sender'}
                          timestamp={new Date(message.created_at).toLocaleString()}
                          preview={plainTextSnippet(message.body)}
                          avatarColorClass={avatarColorForId(message.sender_id)}
                          initials={initialsForName(message.sender_name || message.sender_email || '')}
                          actions={onArchivedRestore ? (
                            <ArchivedActions onRestore={() => onArchivedRestore(message.conversation_id, message.id)} />
                          ) : undefined}
                          detailFooter={
                            <div className="mt-1 inline-flex items-center rounded-full bg-meta-dark/40 px-2 py-0.5 text-[10px] font-medium text-meta-muted">
                              Archived
                            </div>
                          }
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        ) : listMode === 'threads' ? (
          v2Enabled ? (
            v2ThreadEntries.length === 0 ? (
              <div className="px-4 py-6 text-sm text-meta-muted">{listEmptyState}</div>
            ) : (
              <div className="space-y-2 px-4 py-3">
                {v2ThreadEntries.map((summary) => {
                  const conversation = conversationMap.get(summary.conversation_id)
                  if (!conversation) return null
                  const conversationTitle = resolveConversationTitle(conversation)
                  const threadSubject = conversation.title || summary.snippet || conversationTitle
                  const conversationMessages = messagesByConversation[conversation.id] ?? []
                  const conversationMessageCount = conversationMessages.length
                  const messageCount = Math.max(Number(summary.reply_count ?? 0) + 1, conversationMessageCount || 1)
                  const threadUnreadCount = Number(summary.unread_count ?? 0)
                  const hasThreadReplies = Number(summary.reply_count ?? 0) > 0
                  const expandable = hasThreadReplies || conversationMessageCount > 1
                  const expanded = expandable && !!expandedThreads[summary.root_id]
                  const threadMessages = threadMessagesByRootId[summary.root_id] ?? (hasThreadReplies ? [] : conversationMessages)
                  const icon = typeIconMap[conversation.type]
                  const draftKey = `${conversation.id}:${summary.root_id}`
                  return (
                    <ThreadGroup
                      key={`${conversation.id}-${summary.root_id}`}
                      title={threadSubject}
                      subtitle={conversationTitle}
                      timestamp={new Date(summary.last_reply_at || summary.created_at).toLocaleString()}
                      messageCount={messageCount}
                      unreadCount={threadUnreadCount}
                      icon={icon}
                      expanded={expanded}
                      expandable={expandable}
                      active={expanded}
                      selected={selectedThreadId === summary.root_id}
                      onToggle={expandable ? () => {
                        handleToggleThread(summary.root_id)
                        if (!expanded) {
                          onThreadExpand?.(conversation.id, summary.root_id, hasThreadReplies ? 'thread' : 'conversation')
                        }
                      } : undefined}
                      onHeaderSelect={!expandable ? () => onThreadOpen?.(conversation.id, summary.root_id) : undefined}
                      conversationId={conversation.id}
                      onArchive={onArchiveConversation}
                      hasDraft={Boolean(draftsByThreadId[draftKey])}
                    >
                      {expanded ? (
                        threadMessages.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-meta-muted">Loading messages…</div>
                        ) : (
                          [...threadMessages].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                            .map((message) => {
                              const isSelected = selectedMessageId === message.id
                              const isUnread = message.sender_id !== currentUserId && !readMessageIds.has(message.id)
                              return (
                                <MessageListItem
                                  key={message.id}
                                  displayName={message.sender_name || message.sender_email || 'Unknown sender'}
                                  timestamp={new Date(message.created_at).toLocaleString()}
                                  preview={conversation.title || plainTextSnippet(message.body)}
                                  avatarColorClass={avatarColorForId(message.sender_id)}
                                  initials={initialsForName(message.sender_name || message.sender_email || '')}
                                  unread={isUnread}
                                  active={isSelected}
                                  onClick={() => handleMessageSelect(conversation, message, threadMessages, summary.root_id, threadSubject)}
                                  detailFooter={
                                    <div className="mt-1 text-[10px] text-meta-muted">
                                      Thread started {new Date(threadMessages[threadMessages.length - 1]?.created_at ?? conversation.created_at).toLocaleString()}
                                    </div>
                                  }
                                />
                              )
                            })
                        )
                      ) : null}
                    </ThreadGroup>
                  )
                })}
              </div>
            )
          ) : threadEntries.length === 0 ? (
            <div className="px-4 py-6 text-sm text-meta-muted">{listEmptyState}</div>
          ) : (
            <div className="space-y-2 px-4 py-3">
              {threadEntries.map(({ conversation, group }) => {
                const conversationTitle = resolveConversationTitle(conversation)
                const threadMessages = group.messages
                const descendingMessages = [...threadMessages].sort(
                  (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
                )
                const latestMessage = descendingMessages[0] ?? threadMessages[threadMessages.length - 1]
                const rootMessage = threadMessages[0]
                const threadSubject = conversation.title || group.subject || plainTextSnippet(rootMessage.body) || conversationTitle
                const messageCount = conversation.type === 'announcement'
                  ? threadMessages.filter((message) => message.sender_id === currentUserId || message.sender_id === conversation.created_by).length || threadMessages.length
                  : threadMessages.length
                const threadUnreadCount = threadMessages.filter(
                  (message) => message.sender_id !== currentUserId && !readMessageIds.has(message.id),
                ).length
                const expandable = threadMessages.length > 1
                const expanded = expandable && !!expandedThreads[group.rootId]
                const icon = typeIconMap[conversation.type]
                const containsSelection = threadMessages.some((message) => message.id === selectedMessageId)
                const draftKey = `${conversation.id}:${group.rootId}`
                return (
                  <ThreadGroup
                    key={`${conversation.id}-${group.rootId}`}
                    title={threadSubject}
                    subtitle={conversationTitle}
                    timestamp={new Date(latestMessage.created_at).toLocaleString()}
                    messageCount={messageCount}
                    unreadCount={threadUnreadCount}
                    icon={icon}
                    expanded={expanded}
                    expandable={expandable}
                    active={containsSelection && expandable}
                    selected={containsSelection && !expandable}
                    onToggle={expandable ? () => handleToggleThread(group.rootId) : undefined}
                    onHeaderSelect={!expandable ? () => handleMessageSelect(conversation, rootMessage, threadMessages, group.rootId, threadSubject) : undefined}
                    conversationId={conversation.id}
                    onArchive={onArchiveConversation}
                    hasDraft={Boolean(draftsByThreadId[draftKey])}
                  >
                    {expandable
                      ? descendingMessages.map((message) => {
                          const isSelected = selectedMessageId === message.id
                          const isUnread = message.sender_id !== currentUserId && !readMessageIds.has(message.id)
                          return (
                            <MessageListItem
                              key={message.id}
                              displayName={message.sender_name || message.sender_email || 'Unknown sender'}
                              timestamp={new Date(message.created_at).toLocaleString()}
                              preview={conversation.title || plainTextSnippet(message.body)}
                              avatarColorClass={avatarColorForId(message.sender_id)}
                              initials={initialsForName(message.sender_name || message.sender_email || '')}
                              unread={isUnread}
                              active={isSelected}
                              onClick={() => handleMessageSelect(conversation, message, threadMessages, group.rootId, threadSubject)}
                              detailFooter={
                                <div className="mt-1 text-[10px] text-meta-muted">
                                  Thread started {new Date(threadMessages[0]?.created_at ?? conversation.created_at).toLocaleString()}
                                </div>
                              }
                            />
                          )
                        })
                      : null}
                  </ThreadGroup>
                )
              })}
            </div>
          )
        ) : messageEntries.length === 0 ? (
          <div className="px-4 py-6 text-sm text-meta-muted">{listEmptyState}</div>
        ) : (
          <div className="space-y-1 px-4 py-3">
            {/* Pinned conversations section */}
            {pinnedConversations.length > 0 && (
              <div className="mb-2" data-testid="pinned-section">
                <button
                  type="button"
                  className="flex w-full items-center gap-1.5 px-1 py-1 text-[10px] font-semibold uppercase tracking-wider text-blue-400 hover:text-blue-300 transition-colors"
                  onClick={() => setPinnedCollapsed(!pinnedCollapsed)}
                >
                  <Pin className="h-3 w-3" />
                  Pinned ({pinnedConversations.length})
                  <ChevronDown className={`ml-auto h-3 w-3 transition-transform ${pinnedCollapsed ? '-rotate-90' : ''}`} />
                </button>
                {!pinnedCollapsed && pinnedConversations.map((conversation) => {
                  const messages = messagesByConversation[conversation.id] ?? []
                  const latestMessage = [...messages].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
                  if (!latestMessage) return null
                  const groups = threadGroupsByConversation[conversation.id] ?? []
                  const group = groups.find((g) => g.rootId === (latestMessage.parent_message_id ?? latestMessage.id))
                  const threadMessages = group?.messages ?? [latestMessage]
                  const threadSubject = conversation.title || group?.subject || plainTextSnippet(threadMessages[0]?.body || '') || resolveConversationTitle(conversation)
                  const rootId = group?.rootId ?? (latestMessage.parent_message_id ?? latestMessage.id)
                  const isUnread = latestMessage.sender_id !== currentUserId && !readMessageIds.has(latestMessage.id)
                  const muted = isConversationMuted(conversation)
                  return (
                    <MessageListItem
                      key={`pinned-${conversation.id}`}
                      displayName={latestMessage.sender_name || latestMessage.sender_email || 'Unknown sender'}
                      timestamp={new Date(latestMessage.created_at).toLocaleString()}
                      preview={conversation.title || plainTextSnippet(latestMessage.body)}
                      avatarColorClass={avatarColorForId(latestMessage.sender_id)}
                      initials={initialsForName(latestMessage.sender_name || latestMessage.sender_email || '')}
                      unread={isUnread}
                      active={selectedMessageId === latestMessage.id}
                      onClick={() => handleMessageSelect(conversation, latestMessage, threadMessages, rootId, threadSubject)}
                      conversationId={conversation.id}
                      messageId={latestMessage.id}
                      isFlagged={latestMessage.flagged}
                      isPinned={true}
                      isMuted={muted}
                      onFlagToggle={onFlagToggle}
                      onArchive={onArchiveConversation}
                      onPinToggle={onPinToggle}
                      onMuteToggle={onMuteToggle}
                      detailFooter={
                        <div className="mt-1 flex items-center gap-1.5">
                          <Pin className="h-2.5 w-2.5 text-blue-400" />
                          {muted && <BellOff className="h-2.5 w-2.5 text-amber-400" />}
                        </div>
                      }
                    />
                  )
                })}
                <div className="my-1 border-b border-meta-border/30" />
              </div>
            )}
            {messageEntries.filter(({ conversation }) =>
              pinnedConversations.length === 0 || !pinnedConversationIds.has(conversation.id)
            ).map(({ conversation, message, group }) => {
              const threadMessages = group?.messages ?? [message]
              const threadSubject = conversation.title || group?.subject || plainTextSnippet(threadMessages[0]?.body || '') || resolveConversationTitle(conversation)
              const rootId = group?.rootId ?? (message.parent_message_id ?? message.id)
              const isUnread = message.sender_id !== currentUserId && !readMessageIds.has(message.id)
              const muted = isConversationMuted(conversation)
              return (
                <MessageListItem
                  key={`${conversation.id}-${message.id}`}
                  displayName={message.sender_name || message.sender_email || 'Unknown sender'}
                  timestamp={new Date(message.created_at).toLocaleString()}
                  preview={conversation.title || plainTextSnippet(message.body)}
                  avatarColorClass={avatarColorForId(message.sender_id)}
                  initials={initialsForName(message.sender_name || message.sender_email || '')}
                  unread={isUnread}
                  active={selectedMessageId === message.id}
                  onClick={() => handleMessageSelect(conversation, message, threadMessages, rootId, threadSubject)}
                  conversationId={conversation.id}
                  messageId={message.id}
                  isFlagged={message.flagged}
                  isPinned={pinnedConversationIds.has(conversation.id)}
                  isMuted={muted}
                  onFlagToggle={onFlagToggle}
                  onArchive={onArchiveConversation}
                  onPinToggle={onPinToggle}
                  onMuteToggle={onMuteToggle}
                  detailFooter={
                    <>
                      {draftsByThreadId[`${conversation.id}:${rootId}`] ? (
                        <div className="mt-1 inline-flex items-center rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-200">
                          Draft
                        </div>
                      ) : null}
                      {muted && (
                        <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-amber-400">
                          <BellOff className="h-2.5 w-2.5" /> Muted
                        </div>
                      )}
                    </>
                  }
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
