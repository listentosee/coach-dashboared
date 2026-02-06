"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CoachInboxPane, type CoachInboxSelection } from './inbox-pane'
import { CoachReaderPane } from './reader-pane'
import { CoachComposerModal } from './composer-modal'
import { useCoachMessagingData } from '@/lib/coach-messaging/use-coach-messaging-data'
import { useCoachComposer } from '@/lib/coach-messaging/use-coach-composer'
import { useCoachDrafts } from '@/lib/coach-messaging/use-coach-drafts'
import { removeDraft } from '@/lib/coach-messaging/drafts'
import type { ComposerPayload } from '@/lib/coach-messaging/use-coach-composer'
import type { CoachDirectoryUser, CoachMessage } from '@/lib/coach-messaging/types'
import { supabase } from '@/lib/supabase/client'
import { plainTextSnippet } from '@/lib/coach-messaging/utils'

export function CoachMessagingWorkspace() {
  const {
    conversations,
    messagesByConversation,
    threadGroupsByConversation,
    threadSummaries,
    loading,
    subscribeToConversation,
    subscribeToThread,
    refresh,
    setSnapshot,
  } = useCoachMessagingData()
  const [selection, setSelection] = useState<CoachInboxSelection | null>(null)
  const [directory, setDirectory] = useState<CoachDirectoryUser[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string>('coach')
  const [archivedMessages, setArchivedMessages] = useState<Record<string, CoachMessage[]>>({})
  const [archivedLoading, setArchivedLoading] = useState(false)
  useEffect(() => {
    let active = true
    const loadUser = async () => {
      try {
        const { data } = await supabase.auth.getUser()
        if (active) {
          setCurrentUserId(data?.user?.id ?? null)
          // Fetch user role from profiles table
          if (data?.user?.id) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('role')
              .eq('id', data.user.id)
              .single()
            if (profile?.role) {
              setUserRole(profile.role)
            }
          }
        }
      } catch {
        if (active) setCurrentUserId(null)
      }
    }
    void loadUser()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const res = await fetch('/api/messaging/users', { headers: { 'x-messaging-client': '1' } })
        if (!res.ok) return
        const { users } = await res.json()
        if (!active) return
        const mapped: CoachDirectoryUser[] = (users || []).map((user: any) => ({
          id: user.id,
          displayName: user.name || user.email || 'User',
          email: user.email || null,
        }))
        setDirectory(mapped)
      } catch {
        setDirectory([])
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  const markMessagesRead = useCallback(async (ids: string[], { refresh: shouldRefresh = true }: { refresh?: boolean } = {}) => {
    if (!ids || ids.length === 0) return
    try {
      const response = await fetch('/api/messaging/read-receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ messageIds: ids }),
      })
      if (!response.ok) {
        const errorBody = await response.json().catch(() => null)
        const message = typeof errorBody?.error === 'string' ? errorBody.error : response.statusText
        console.error('Failed to mark messages read', message)
        return
      }
      window.dispatchEvent(new Event('unread-refresh'))
      if (shouldRefresh) {
        await refresh()
      }
    } catch (err) {
      console.error('Failed to mark messages read', err)
    }
  }, [refresh])

  const handleMessagesRead = useCallback((ids: string[]) => {
    void markMessagesRead(ids)
  }, [markMessagesRead])

  const v2Enabled = useMemo(() => process.env.NEXT_PUBLIC_MESSAGING_V2 === 'true', [])

  const [threadMessagesByRootId, setThreadMessagesByRootId] = useState<Record<string, CoachMessage[]>>({})

  const loadThreadMessages = useCallback(async (rootId: string) => {
    const res = await fetch(`/api/messaging/threads/${rootId}`)
    if (!res.ok) throw new Error('Failed to load thread')
    const { messages = [] } = await res.json()
    return (messages as any[]).map((row) => ({
      ...row,
      id: `${row.id}`,
      parent_message_id: row.parent_message_id != null ? `${row.parent_message_id}` : null,
    })) as CoachMessage[]
  }, [])

  const handleThreadOpen = useCallback(async (conversationId: string, rootId: string) => {
    const conversation = conversations.find((c) => c.id === conversationId)
    if (!conversation) return
    try {
      const threadMessages = await loadThreadMessages(rootId)
      setThreadMessagesByRootId((prev) => ({ ...prev, [rootId]: threadMessages }))
      const message = threadMessages[0] ?? null
      if (!message) return
      const threadSubject = conversation.title || plainTextSnippet(message.body) || null
      setSelection({
        conversation,
        message,
        threadId: rootId,
        threadSubject,
        threadMessages,
      })
      if (threadMessages.length > 0) {
        await markMessagesRead(threadMessages.map((m) => m.id), { refresh: false })
      }
      subscribeToThread(conversationId, rootId)
    } catch (error) {
      console.error('Failed to open thread', error)
    }
  }, [conversations, subscribeToThread, markMessagesRead, loadThreadMessages])

  const loadConversationMessages = useCallback(async (conversationId: string) => {
    const res = await fetch(`/api/messaging/conversations/${conversationId}/messages?limit=500`)
    if (!res.ok) throw new Error('Failed to load conversation messages')
    const { messages = [] } = await res.json()
    return (messages as any[]).map((row) => ({
      ...row,
      id: `${row.id}`,
      parent_message_id: row.parent_message_id != null ? `${row.parent_message_id}` : null,
    })) as CoachMessage[]
  }, [])

  const handleThreadExpand = useCallback(async (
    conversationId: string,
    rootId: string,
    mode: 'thread' | 'conversation'
  ) => {
    if (threadMessagesByRootId[rootId]) return
    try {
      const loaded = mode === 'conversation'
        ? await loadConversationMessages(conversationId)
        : await loadThreadMessages(rootId)
      setThreadMessagesByRootId((prev) => ({ ...prev, [rootId]: loaded }))
      if (loaded.length > 0) {
        await markMessagesRead(loaded.map((m) => m.id), { refresh: false })
      }
    } catch (error) {
      console.error('Failed to load thread messages', error)
    }
  }, [threadMessagesByRootId, loadThreadMessages, loadConversationMessages, markMessagesRead])

  const handleComposerSend = useCallback(async (payload: ComposerPayload) => {
    // Replies always stay within the same conversation/thread
    if (payload.mode === 'reply') {
      if (!payload.context) return

      // Simple: just send to the existing conversation
      subscribeToThread(payload.context.conversation.id, payload.context.threadId)
      const conversationId = payload.context.conversation.id
      const parentId = payload.mode === 'reply' ? payload.context.threadId : null

      const response = await fetch(`/api/messaging/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: payload.body,
          parentMessageId: parentId,
          highPriority: payload.highPriority ?? false,
        }),
      })
      if (!response.ok) throw new Error('Failed to send message')
      const data = await response.json().catch(() => null)
      const messageId = data?.id ? String(data.id) : null
      if (messageId) {
        const createdAt = data?.created_at ?? new Date().toISOString()
        const newMessage: CoachMessage = {
          id: messageId,
          conversation_id: conversationId,
          sender_id: currentUserId ?? '',
          body: payload.body,
          created_at: createdAt,
          parent_message_id: parentId,
          sender_name: null,
          sender_email: null,
          read_at: createdAt,
          flagged: false,
          archived_at: null,
          high_priority: payload.highPriority ?? false,
        }
        setSnapshot({
          conversations: conversations.map((c) => c.id === conversationId
            ? { ...c, last_message_at: createdAt }
            : c),
          messagesByConversation: {
            ...messagesByConversation,
            [conversationId]: [newMessage, ...(messagesByConversation[conversationId] ?? [])],
          },
        })
        await markMessagesRead([messageId], { refresh: false })
      }
    } else {
      if (payload.mode === 'announcement') {
        // Handle announcement creation
        if (!payload.subject?.trim()) throw new Error('Subject is required for announcements')
        const createRes = await fetch('/api/messaging/announcements/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: payload.subject,
            body: payload.body
          }),
        })
        if (!createRes.ok) throw new Error('Failed to send announcement')
        const { conversationId } = await createRes.json()
        subscribeToConversation(conversationId)
        // Note: Announcements don't need read receipt marking as they're broadcast
      } else {
        const recipientIds = payload.mode === 'dm'
          ? (payload.dmRecipientId ? [payload.dmRecipientId] : [])
          : payload.groupRecipientIds || []
        if (recipientIds.length === 0) throw new Error('Select at least one recipient')
        const isDirect =
          payload.mode === 'dm' ||
          (payload.mode === 'forward' && recipientIds.length === 1)

        if (isDirect) {
          const targetUserId = recipientIds[0]
          const createRes = await fetch('/api/messaging/conversations/dm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: targetUserId, title: payload.subject || null }),
          })
          if (!createRes.ok) throw new Error('Failed to start direct message')
          const { conversationId } = await createRes.json()
          subscribeToConversation(conversationId)
          const sendRes = await fetch(`/api/messaging/conversations/${conversationId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ body: payload.body, highPriority: payload.highPriority ?? false }),
          })
          if (!sendRes.ok) throw new Error('Failed to send direct message')
          const sendData = await sendRes.json().catch(() => null)
          const messageId = sendData?.id ? String(sendData.id) : null
          if (messageId) {
            const createdAt = sendData?.created_at ?? new Date().toISOString()
            const newMessage: CoachMessage = {
              id: messageId,
              conversation_id: conversationId,
              sender_id: currentUserId ?? '',
              body: payload.body,
              created_at: createdAt,
              parent_message_id: null,
              sender_name: null,
              sender_email: null,
              read_at: createdAt,
              flagged: false,
              archived_at: null,
              high_priority: payload.highPriority ?? false,
            }
            const existingConversation = conversations.find((c) => c.id === conversationId)
            setSnapshot({
              conversations: existingConversation
                ? conversations.map((c) => c.id === conversationId ? { ...c, last_message_at: createdAt } : c)
                : [...conversations, { id: conversationId, type: 'dm', title: payload.subject ?? null, created_by: currentUserId ?? null, created_at: createdAt, unread_count: 0, last_message_at: createdAt }],
              messagesByConversation: {
                ...messagesByConversation,
                [conversationId]: [newMessage, ...(messagesByConversation[conversationId] ?? [])],
              },
            })
            await markMessagesRead([messageId], { refresh: false })
          }
        } else {
          // Group send (new group or forward to multiple recipients)
          const createRes = await fetch('/api/messaging/conversations/group', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userIds: recipientIds,
              title: payload.subject || undefined,
            }),
          })
          if (!createRes.ok) throw new Error('Failed to start group message')
          const { conversationId } = await createRes.json()
          subscribeToConversation(conversationId)
          const sendRes = await fetch(`/api/messaging/conversations/${conversationId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ body: payload.body, highPriority: payload.highPriority ?? false }),
          })
          if (!sendRes.ok) throw new Error('Failed to send group message')
          const sendData = await sendRes.json().catch(() => null)
          const messageId = sendData?.id ? String(sendData.id) : null
          if (messageId) {
            const createdAt = sendData?.created_at ?? new Date().toISOString()
            const newMessage: CoachMessage = {
              id: messageId,
              conversation_id: conversationId,
              sender_id: currentUserId ?? '',
              body: payload.body,
              created_at: createdAt,
              parent_message_id: null,
              sender_name: null,
              sender_email: null,
              read_at: createdAt,
              flagged: false,
              archived_at: null,
              high_priority: payload.highPriority ?? false,
            }
            const existingConversation = conversations.find((c) => c.id === conversationId)
            setSnapshot({
              conversations: existingConversation
                ? conversations.map((c) => c.id === conversationId ? { ...c, last_message_at: createdAt } : c)
                : [...conversations, { id: conversationId, type: 'group', title: payload.subject ?? null, created_by: currentUserId ?? null, created_at: createdAt, unread_count: 0, last_message_at: createdAt }],
              messagesByConversation: {
                ...messagesByConversation,
                [conversationId]: [newMessage, ...(messagesByConversation[conversationId] ?? [])],
              },
            })
            await markMessagesRead([messageId], { refresh: false })
          }
        }
      }
    }

    void refresh()
  }, [subscribeToThread, subscribeToConversation, refresh, markMessagesRead, setSnapshot, conversations, messagesByConversation, currentUserId])

  const handleArchiveConversation = useCallback(async (conversationId: string) => {
    try {
      const res = await fetch(`/api/messaging/conversations/${conversationId}/archive`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to archive conversation')
      await refresh()
      window.dispatchEvent(new Event('unread-refresh'))
    } catch (error) {
      console.error('Archive conversation error:', error)
    }
  }, [refresh])

  const handleViewArchived = useCallback(async () => {
    // Fetch archived messages for all conversations
    setArchivedLoading(true)
    const archivedByConv: Record<string, CoachMessage[]> = {}
    await Promise.all(
      conversations.map(async (conversation) => {
        try {
          const res = await fetch(`/api/messaging/conversations/${conversation.id}/messages?limit=500&includeArchived=true`)
          if (!res.ok) return
          const { messages = [] } = await res.json()
          // Filter to only archived messages
          const archived = messages.filter((m: any) => m.archived_at != null)
          if (archived.length > 0) {
            archivedByConv[conversation.id] = archived
          }
        } catch {
          // Ignore fetch failures
        }
      })
    )
    setArchivedMessages(archivedByConv)
    setArchivedLoading(false)
  }, [conversations])

  const handleUnarchiveMessage = useCallback(async (conversationId: string, messageId: string) => {
    try {
      const res = await fetch(`/api/messaging/conversations/${conversationId}/archive?messageId=${messageId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to restore message')
      // Refresh archived list
      await handleViewArchived()
      // Refresh main message list
      await refresh()
    } catch (error) {
      console.error('Restore message error:', error)
    }
  }, [refresh, handleViewArchived])

  const handleFlagToggle = useCallback(async (messageId: string, flagged: boolean) => {
    try {
      const method = flagged ? 'POST' : 'DELETE'
      const res = await fetch(`/api/messaging/messages/${messageId}/flag`, { method })
      if (!res.ok) throw new Error('Failed to toggle flag')
      await refresh()
    } catch (error) {
      console.error('Flag toggle error:', error)
    }
  }, [refresh])

  const effectiveUserId = currentUserId ?? ''

  const drafts = useCoachDrafts(effectiveUserId)

  const composer = useCoachComposer({
    currentUserId: effectiveUserId,
    onSend: handleComposerSend,
    drafts,
  })

  const draftItems = useMemo(() => {
    return drafts.map((draft) => {
      const conversation = draft.conversationId
        ? conversations.find((c) => c.id === draft.conversationId) || null
        : null
      const group = conversation
        ? (threadGroupsByConversation[conversation.id] ?? []).find((g) => g.rootId === draft.threadId) || null
        : null

      let title = 'Draft'
      if (draft.mode === 'reply' || draft.mode === 'forward') {
        const subject = conversation?.title || group?.subject
        title = subject ? `Draft reply: ${subject}` : 'Draft reply'
      } else if (draft.mode === 'announcement') {
        title = draft.subject ? `Draft announcement: ${draft.subject}` : 'Draft announcement'
      } else if (draft.mode === 'group') {
        title = draft.subject ? `Draft group: ${draft.subject}` : 'Draft group message'
      } else if (draft.mode === 'dm') {
        const recipient = draft.dmRecipientId
          ? directory.find((user) => user.id === draft.dmRecipientId)
          : null
        title = recipient ? `Draft to ${recipient.displayName}` : 'Draft direct message'
      }

      const preview = draft.body?.trim()
        ? plainTextSnippet(draft.body)
        : draft.subject?.trim()
        ? plainTextSnippet(draft.subject)
        : 'Empty draft'

      return {
        id: draft.id,
        title,
        preview,
        updatedAt: draft.updatedAt,
        conversationId: draft.conversationId,
        threadId: draft.threadId,
        mode: draft.mode,
      }
    })
  }, [drafts, conversations, threadGroupsByConversation, directory])

  const draftsByThreadId = useMemo(() => {
    const map: Record<string, boolean> = {}
    for (const draft of drafts) {
      if (!draft.conversationId || !draft.threadId) continue
      map[`${draft.conversationId}:${draft.threadId}`] = true
    }
    return map
  }, [drafts])

  const resolveDraftSelection = useCallback((draftId: string) => {
    const draft = drafts.find((item) => item.id === draftId)
    if (!draft) return { draft: null, selection: null }
    if (!draft.conversationId || !draft.threadId) return { draft, selection: null }

    const conversation = conversations.find((c) => c.id === draft.conversationId)
    if (!conversation) return { draft, selection: null }
    const groups = threadGroupsByConversation[conversation.id] ?? []
    const group = groups.find((g) => g.rootId === draft.threadId) || null
    const threadMessages = group?.messages ?? messagesByConversation[conversation.id] ?? []
    const message = threadMessages.find((m) => m.id === draft.threadId) ?? threadMessages[0]
    if (!message) return { draft, selection: null }
    const threadSubject = conversation.title || group?.subject || plainTextSnippet(message.body) || null
    return {
      draft,
      selection: {
        conversation,
        message,
        threadId: draft.threadId,
        threadSubject,
        threadMessages,
      } as CoachInboxSelection,
    }
  }, [drafts, conversations, threadGroupsByConversation, messagesByConversation])

  return (
    <div className="flex h-[calc(100vh-6rem)] min-h-0 w-full flex-col overflow-hidden">
      <div className="grid flex-1 gap-4 overflow-hidden lg:grid-cols-12 min-h-0">
        <div className="flex min-h-0 min-w-0 overflow-hidden lg:col-span-5">
          <CoachInboxPane
            conversations={conversations}
            messagesByConversation={messagesByConversation}
            threadGroupsByConversation={threadGroupsByConversation}
            threadSummaries={threadSummaries}
            loading={loading}
            currentUserId={effectiveUserId}
            v2Enabled={v2Enabled}
            threadMessagesByRootId={threadMessagesByRootId}
            onThreadOpen={handleThreadOpen}
            onThreadExpand={handleThreadExpand}
            drafts={draftItems}
            draftsByThreadId={draftsByThreadId}
            onDraftDelete={(draftId) => {
              void removeDraft(draftId)
            }}
            archivedMessagesByConversation={archivedMessages}
            archivedLoading={archivedLoading}
            onArchivedRestore={handleUnarchiveMessage}
            onDraftOpen={(draftId) => {
              const { draft, selection } = resolveDraftSelection(draftId)
              if (!draft) return
              composer.openDraft(draft, selection)
            }}
            onSelectionChange={setSelection}
            onCompose={(mode) => {
              if (mode === 'dm') composer.openDm()
              else if (mode === 'group') composer.openGroup()
              else if (mode === 'announcement') {
                // Open announcement composer for admins
                composer.openAnnouncement()
              }
            }}
            onMessagesRead={handleMessagesRead}
            subscribeToConversation={subscribeToConversation}
            onArchiveConversation={handleArchiveConversation}
            onFlagToggle={handleFlagToggle}
            onViewArchived={handleViewArchived}
            onRefresh={refresh}
            isAdmin={userRole === 'admin'}
          />
        </div>
        <div className="flex min-h-0 min-w-0 overflow-hidden lg:col-span-7">
          <CoachReaderPane
            selection={selection}
            currentUserId={effectiveUserId}
            userRole={userRole}
            onReply={(selection) => {
              // Announcements: Open DM composer with announcement sender
              if (selection.conversation.type === 'announcement') {
                const senderId = selection.conversation.created_by
                if (senderId) {
                  composer.openDm({
                    recipientId: senderId,
                    subject: `Re: ${selection.conversation.title || 'Announcement'}`,
                    lockRecipient: true,
                  })
                }
              } else {
                // Normal reply to DM/Group
                composer.openReply(selection)
              }
            }}
            onForward={(selection) => composer.openForward(selection)}
            subscribeToThread={subscribeToThread}
          />
        </div>
      </div>
      <CoachComposerModal controller={composer} directory={directory} />
    </div>
  )
}
