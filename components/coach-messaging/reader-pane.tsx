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
  const [roster, setRoster] = useState<{ seen: string[] }>({ seen: [] })
  const [rosterLoading, setRosterLoading] = useState(false)

  useEffect(() => {
    if (!subscribeToThread || !selection) return
    const unsubscribe = subscribeToThread(selection.conversation.id, selection.threadId)
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [selection?.conversation.id, selection?.threadId, subscribeToThread, selection])

  useEffect(() => {
    let active = true
    if (!selection || userRole !== 'admin') {
      setRoster({ seen: [] })
      return
    }

    const fetchRoster = async () => {
      setRosterLoading(true)
      try {
        const res = await fetch(`/api/messaging/read-status?messageId=${selection.message.id}`)
        if (!res.ok) {
          setRoster({ seen: [] })
          return
        }
        const data = await res.json()
        if (!active) return
        setRoster({
          seen: Array.isArray(data.seen) ? data.seen : [],
        })
      } catch {
        if (!active) return
        setRoster({ seen: [] })
      } finally {
        if (active) setRosterLoading(false)
      }
    }

    void fetchRoster()
    return () => {
      active = false
    }
  }, [selection?.message?.id, selection, userRole])

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
          <span className="uppercase tracking-wide">Seen by:</span>
          {rosterLoading ? (
            <span>Loading...</span>
          ) : roster.seen.length === 0 ? (
            <span>No viewers yet</span>
          ) : (
            <details className="cursor-pointer select-none">
              <summary className="underline">
                {roster.seen.length} reader{roster.seen.length === 1 ? '' : 's'}
              </summary>
              <div className="mt-2 whitespace-pre-wrap break-words text-xs text-meta-light">
                {roster.seen.join(', ')}
              </div>
            </details>
          )}
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
