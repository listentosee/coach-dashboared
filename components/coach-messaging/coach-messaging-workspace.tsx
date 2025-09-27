"use client"

import { useCallback, useEffect, useState } from 'react'
import { CoachInboxPane, type CoachInboxSelection } from './inbox-pane'
import { CoachReaderPane } from './reader-pane'
import { CoachComposerModal } from './composer-modal'
import { useCoachMessagingData } from '@/lib/coach-messaging/use-coach-messaging-data'
import { useCoachComposer } from '@/lib/coach-messaging/use-coach-composer'
import type { ComposerPayload } from '@/lib/coach-messaging/use-coach-composer'
import type { CoachDirectoryUser } from '@/lib/coach-messaging/types'
import { supabase } from '@/lib/supabase/client'

export function CoachMessagingWorkspace() {
  const {
    conversations,
    messagesByConversation,
    threadGroupsByConversation,
    loading,
    subscribeToConversation,
    subscribeToThread,
    refresh,
  } = useCoachMessagingData()
  const [selection, setSelection] = useState<CoachInboxSelection | null>(null)
  const [directory, setDirectory] = useState<CoachDirectoryUser[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const loadUser = async () => {
      try {
        const { data } = await supabase.auth.getUser()
        if (active) setCurrentUserId(data?.user?.id ?? null)
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

  const handleComposerSend = useCallback(async (payload: ComposerPayload) => {
    if (payload.mode === 'reply' || payload.mode === 'forward') {
      if (!payload.context) return
      subscribeToThread(payload.context.conversation.id, payload.context.threadId)
      const conversationId = payload.context.conversation.id
      const parentId = payload.mode === 'reply' ? payload.context.threadId : null
      const response = await fetch(`/api/messaging/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: payload.body,
          parentMessageId: parentId,
        }),
      })
      if (!response.ok) throw new Error('Failed to send message')
      const data = await response.json().catch(() => null)
      const messageId = data?.id ? String(data.id) : null
      if (messageId) {
        await markMessagesRead([messageId], { refresh: false })
      }
    } else {
      const recipientIds = payload.mode === 'dm'
        ? (payload.dmRecipientId ? [payload.dmRecipientId] : [])
        : payload.groupRecipientIds || []
      if (recipientIds.length === 0) throw new Error('Select at least one recipient')
      if (payload.mode === 'dm') {
        const createRes = await fetch('/api/messaging/conversations/dm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: recipientIds[0], title: payload.subject || null }),
        })
        if (!createRes.ok) throw new Error('Failed to start direct message')
        const { conversationId } = await createRes.json()
        subscribeToConversation(conversationId)
        const sendRes = await fetch(`/api/messaging/conversations/${conversationId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: payload.body }),
        })
        if (!sendRes.ok) throw new Error('Failed to send direct message')
        const sendData = await sendRes.json().catch(() => null)
        const messageId = sendData?.id ? String(sendData.id) : null
        if (messageId) {
          await markMessagesRead([messageId], { refresh: false })
        }
      } else {
        const createRes = await fetch('/api/messaging/conversations/group', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds: recipientIds, title: payload.subject || undefined }),
        })
        if (!createRes.ok) throw new Error('Failed to start group message')
        const { conversationId } = await createRes.json()
        subscribeToConversation(conversationId)
        const sendRes = await fetch(`/api/messaging/conversations/${conversationId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: payload.body }),
        })
        if (!sendRes.ok) throw new Error('Failed to send group message')
        const sendData = await sendRes.json().catch(() => null)
        const messageId = sendData?.id ? String(sendData.id) : null
        if (messageId) {
          await markMessagesRead([messageId], { refresh: false })
        }
      }
    }

    await refresh()
  }, [subscribeToThread, subscribeToConversation, refresh, markMessagesRead])

  const effectiveUserId = currentUserId ?? ''

  const composer = useCoachComposer({
    currentUserId: effectiveUserId,
    onSend: handleComposerSend,
  })

  return (
    <div className="flex h-[calc(100vh-6rem)] min-h-0 w-full flex-col overflow-hidden">
      <div className="grid flex-1 gap-4 overflow-hidden lg:grid-cols-12 min-h-0">
        <div className="flex min-h-0 min-w-0 overflow-hidden lg:col-span-5">
          <CoachInboxPane
            conversations={conversations}
            messagesByConversation={messagesByConversation}
            threadGroupsByConversation={threadGroupsByConversation}
            loading={loading}
            currentUserId={effectiveUserId}
            onSelectionChange={setSelection}
            onCompose={(mode) => {
              if (mode === 'dm') composer.openDm()
              else composer.openGroup()
            }}
            onMessagesRead={handleMessagesRead}
            subscribeToConversation={subscribeToConversation}
          />
        </div>
        <div className="flex min-h-0 min-w-0 overflow-hidden lg:col-span-7">
          <CoachReaderPane
            selection={selection}
            currentUserId={effectiveUserId}
            onReply={(selection) => composer.openReply(selection)}
            onForward={(selection) => composer.openForward(selection)}
            subscribeToThread={subscribeToThread}
          />
        </div>
      </div>
      <CoachComposerModal controller={composer} directory={directory} />
    </div>
  )
}
