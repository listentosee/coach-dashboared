"use client"

import { useEffect, useMemo, useState } from 'react'
import { ReaderHeader } from './reader-header'
import { MessageViewer } from './message-viewer'
import type { CoachInboxSelection } from './inbox-pane'
import { Badge } from '@/components/ui/badge'

export type CoachReaderPaneProps = {
  selection: CoachInboxSelection | null
  currentUserId?: string
  userRole?: string
  onReply?: (selection: CoachInboxSelection) => void
  onForward?: (selection: CoachInboxSelection) => void
  subscribeToThread?: (conversationId: string, threadId: string) => (() => void) | void
}

export function CoachReaderPane({ selection, currentUserId = '', userRole = 'coach', onReply, onForward, subscribeToThread }: CoachReaderPaneProps) {
  const [showNotSeen, setShowNotSeen] = useState(true)

  useEffect(() => {
    if (!subscribeToThread || !selection) return
    const unsubscribe = subscribeToThread(selection.conversation.id, selection.threadId)
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [selection?.conversation.id, selection?.threadId, subscribeToThread, selection])

  const roster = useMemo(() => {
    if (!selection) return { seen: [] as string[], notSeen: [] as string[] }
    const uniqueSenders = new Map<string, string>()
    for (const message of selection.threadMessages) {
      const name = message.sender_name || message.sender_email || 'Unknown sender'
      if (message.sender_id) uniqueSenders.set(message.sender_id, name)
    }
    uniqueSenders.delete(currentUserId)
    const allParticipants = Array.from(uniqueSenders.values())
    const midpoint = Math.ceil(allParticipants.length / 2)
    return {
      seen: allParticipants.slice(0, midpoint),
      notSeen: allParticipants.slice(midpoint),
    }
  }, [selection, currentUserId])

  const list = showNotSeen ? roster.notSeen : roster.seen
  const label = showNotSeen ? 'Not seen by' : 'Seen by'
  const disabled = !selection

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden rounded-md border border-meta-border bg-meta-card/10">
      <ReaderHeader
        disabled={disabled}
        onReply={selection ? () => onReply?.(selection) : undefined}
        onForward={selection ? () => onForward?.(selection) : undefined}
      />
      <div className="border-b border-meta-border bg-meta-card/20 px-4 py-3">
        {selection ? (
          <div className="space-y-1 text-sm text-meta-muted">
            <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-meta-muted">
              <Badge variant="secondary">{selection.conversation.type}</Badge>
              <span>{selection.threadSubject || 'Thread'}</span>
            </div>
            <div className="text-xs text-meta-muted">
              Thread started {new Date(selection.threadMessages[0]?.created_at ?? selection.message.created_at).toLocaleString()}
              <span className="mx-1">•</span>
              {selection.threadMessages.length} message{selection.threadMessages.length === 1 ? '' : 's'}
            </div>
          </div>
        ) : (
          <div className="text-sm text-meta-muted">Select a conversation, thread, or message to view.</div>
        )}
      </div>
      {selection && userRole === 'admin' ? (
        <div className="flex items-center gap-2 border-b border-meta-border bg-meta-card/40 px-4 py-2 text-[11px] text-meta-muted">
          <span className="uppercase tracking-wide">{label}:</span>
          <span className="whitespace-pre-wrap break-words">
            {list.length > 0 ? list.join(', ') : (showNotSeen ? 'Everyone has seen this' : 'No viewers yet')}
          </span>
          <span className="ml-auto">
            <button className="underline hover:text-meta-light" onClick={() => setShowNotSeen((prev) => !prev)}>
              {showNotSeen ? 'Show seen' : 'Show not seen'}
            </button>
          </span>
        </div>
      ) : null}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        {selection ? (
          <MessageViewer
            senderName={selection.message.sender_name || selection.message.sender_email || 'Unknown sender'}
            createdAt={new Date(selection.message.created_at).toLocaleString()}
            body={selection.message.body}
          />
        ) : (
          <div className="text-sm text-meta-muted">Pick a message from the inbox to read the contents here.</div>
        )}
      </div>
    </div>
  )
}
