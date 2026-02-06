"use client"

import { useEffect, useMemo, useState } from 'react'
import { InboxActionBar, InboxListMode, InboxViewMode, ConversationType } from './inbox-action-bar'
import { ThreadGroup } from './thread-group'
import { MessageListItem } from './message-list-item'
import { DraftActions } from './draft-actions'
import { ArchivedActions } from './archived-actions'
import { avatarColorForId, initialsForName, plainTextSnippet } from '@/lib/coach-messaging/utils'
import type { CoachConversation, CoachMessage, ThreadGroup as DerivedThreadGroup, ThreadSummary } from '@/lib/coach-messaging/types'
import { Megaphone, MessageSquare, Users } from 'lucide-react'

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
  archivedMessagesByConversation?: Record<string, CoachMessage[]>
  onArchivedRestore?: (conversationId: string, messageId: string) => void
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
  archivedMessagesByConversation = {},
  onArchivedRestore,
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
    const visible = conversations.filter((conversation) => filters[conversation.type])
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
    return [...subset].sort((a, b) => {
      // Sort by date (most recent first)
      const aDate = new Date(a.last_message_at || a.created_at).getTime()
      const bDate = new Date(b.last_message_at || b.created_at).getTime()
      return bDate - aDate
    })
  }, [conversations, filters, viewMode, messagesByConversation, currentUserId, readMessageIds])

  const conversationMap = useMemo(() => {
    return new Map(conversations.map((conversation) => [conversation.id, conversation]))
  }, [conversations])

  const v2ThreadEntries = useMemo(() => {
    if (!v2Enabled) return []
    const entries = threadSummaries.filter((summary) => {
      const conversation = conversationMap.get(summary.conversation_id)
      if (!conversation) return false
      if (!filters[conversation.type]) return false
      if (viewMode === 'unread' && (summary.unread_count ?? 0) === 0) return false
      if (viewMode === 'flagged') return false
      return true
    })
    return entries.sort((a, b) => {
      const aDate = new Date(a.last_reply_at || a.created_at).getTime()
      const bDate = new Date(b.last_reply_at || b.created_at).getTime()
      return bDate - aDate
    })
  }, [threadSummaries, conversationMap, filters, viewMode, v2Enabled])

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
    const messages = messagesByConversation[conversation.id] ?? []
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
    return entries.sort((a, b) => new Date(b.group.lastActivityAt).getTime() - new Date(a.group.lastActivityAt).getTime())
  }, [filteredConversations, threadGroupsByConversation, viewMode, currentUserId, readMessageIds])

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
    return entries.sort((a, b) => new Date(b.message.created_at).getTime() - new Date(a.message.created_at).getTime())
  }, [filteredConversations, messagesByConversation, threadGroupsByConversation, viewMode, currentUserId, readMessageIds])

  const listEmptyState = (() => {
    if (loading || (viewMode === 'archived' && archivedLoading)) return 'Loading messages…'
    if (viewMode === 'drafts') return 'No drafts saved yet.'
    if (viewMode === 'archived') return 'No archived messages.'
    return listMode === 'threads' ? 'No threads match the current filters.' : 'No messages match the current filters.'
  })()

  const selectedThreadId = selection.threadId
  const selectedMessageId = selection.messageId

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden rounded-md border border-meta-border bg-meta-card/10">
      <InboxActionBar
        listMode={listMode}
        onListModeChange={setListMode}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        filters={filters}
        onFiltersChange={setFilters}
        draftsCount={drafts.length}
        onCompose={onCompose}
        onViewArchived={onViewArchived}
        isAdmin={isAdmin}
      />
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
            <div className="space-y-1 px-4 py-3">
              {Object.entries(archivedMessagesByConversation).flatMap(([conversationId, messages]) => {
                const conversation = conversations.find((c) => c.id === conversationId)
                return (messages || []).map((message) => {
                  const messageConversation = conversationMap.get(message.conversation_id) ?? conversation
                  return (
                  <MessageListItem
                    key={`${message.conversation_id}-${message.id}`}
                    displayName={message.sender_name || message.sender_email || 'Unknown sender'}
                    timestamp={new Date(message.created_at).toLocaleString()}
                    preview={(messageConversation?.title || plainTextSnippet(message.body)) ?? ''}
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
                )})
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
            {messageEntries.map(({ conversation, message, group }) => {
              const threadMessages = group?.messages ?? [message]
              const threadSubject = conversation.title || group?.subject || plainTextSnippet(threadMessages[0]?.body || '') || resolveConversationTitle(conversation)
              const rootId = group?.rootId ?? (message.parent_message_id ?? message.id)
              const isUnread = message.sender_id !== currentUserId && !readMessageIds.has(message.id)
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
                  onFlagToggle={onFlagToggle}
                  onArchive={onArchiveConversation}
                  detailFooter={
                    draftsByThreadId[`${conversation.id}:${rootId}`] ? (
                      <div className="mt-1 inline-flex items-center rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-200">
                        Draft
                      </div>
                    ) : null
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
