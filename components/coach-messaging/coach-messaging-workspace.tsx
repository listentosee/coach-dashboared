"use client"

import { useCallback, useEffect, useState } from 'react'
import { CoachInboxPane, type CoachInboxSelection } from './inbox-pane'
import { CoachReaderPane } from './reader-pane'
import { CoachComposerModal } from './composer-modal'
import { ArchivedModal } from './archived-modal'
import { useCoachMessagingData } from '@/lib/coach-messaging/use-coach-messaging-data'
import { useCoachComposer } from '@/lib/coach-messaging/use-coach-composer'
import type { ComposerPayload } from '@/lib/coach-messaging/use-coach-composer'
import type { CoachDirectoryUser, CoachMessage } from '@/lib/coach-messaging/types'
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
  const [userRole, setUserRole] = useState<string>('coach')
  const [archivedModalOpen, setArchivedModalOpen] = useState(false)
  const [archivedMessages, setArchivedMessages] = useState<Record<string, CoachMessage[]>>({})
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
        }),
      })
      if (!response.ok) throw new Error('Failed to send message')
      const data = await response.json().catch(() => null)
      const messageId = data?.id ? String(data.id) : null
      if (messageId) {
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
            body: JSON.stringify({ body: payload.body }),
          })
          if (!sendRes.ok) throw new Error('Failed to send direct message')
          const sendData = await sendRes.json().catch(() => null)
          const messageId = sendData?.id ? String(sendData.id) : null
          if (messageId) {
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
    }

    await refresh()
  }, [subscribeToThread, subscribeToConversation, refresh, markMessagesRead])

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
    setArchivedModalOpen(true)
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
      <ArchivedModal
        open={archivedModalOpen}
        onClose={() => setArchivedModalOpen(false)}
        conversations={conversations}
        messagesByConversation={archivedMessages}
        onRestore={handleUnarchiveMessage}
      />
    </div>
  )
}
