"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReaderHeader } from './reader-header'
import { MessageViewer } from './message-viewer'
import type { CoachInboxSelection } from './inbox-pane'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Search, X } from 'lucide-react'

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
  const [readerSearch, setReaderSearch] = useState('')
  const [readerSearchOpen, setReaderSearchOpen] = useState(false)
  const readerSearchRef = useRef<HTMLInputElement>(null)

  // Reset search when selection changes
  useEffect(() => {
    setReaderSearch('')
    setReaderSearchOpen(false)
  }, [selection?.conversation.id, selection?.threadId])

  // Focus input when search opens
  useEffect(() => {
    if (readerSearchOpen) {
      readerSearchRef.current?.focus()
    }
  }, [readerSearchOpen])

  const handleSearchToggle = useCallback(() => {
    setReaderSearchOpen((prev) => {
      if (prev) {
        setReaderSearch('')
      }
      return !prev
    })
  }, [])

  // Filter thread messages based on search
  const filteredMessages = useMemo(() => {
    if (!selection) return []
    if (!readerSearch.trim()) return selection.threadMessages
    const query = readerSearch.toLowerCase()
    return selection.threadMessages.filter((m) => {
      const body = (m.body || '').toLowerCase()
      const sender = (m.sender_name || m.sender_email || '').toLowerCase()
      return body.includes(query) || sender.includes(query)
    })
  }, [selection, readerSearch])

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
        onSearchToggle={selection ? handleSearchToggle : undefined}
        searchActive={readerSearchOpen}
      />
      {/* Search bar */}
      {readerSearchOpen && selection && (
        <div className="relative border-b border-meta-border/50 px-4 py-2" data-testid="reader-search-bar">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-meta-muted pointer-events-none" />
          <Input
            ref={readerSearchRef}
            type="text"
            placeholder="Search in this conversation..."
            value={readerSearch}
            onChange={(e) => setReaderSearch(e.target.value)}
            className="h-8 pl-8 pr-8 text-sm bg-slate-900/30 border-slate-700/50 text-slate-50 placeholder:text-slate-400"
            data-testid="reader-search-input"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setReaderSearch('')
                setReaderSearchOpen(false)
              }
            }}
          />
          {readerSearch && (
            <button
              type="button"
              className="absolute right-6 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-meta-surface/50 text-meta-muted hover:text-meta-foreground transition-colors"
              onClick={() => setReaderSearch('')}
              title="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {readerSearch.trim() && (
            <div className="mt-1 text-[10px] text-meta-muted">
              {filteredMessages.length} of {selection.threadMessages.length} message{selection.threadMessages.length === 1 ? '' : 's'}
            </div>
          )}
        </div>
      )}
      <div className="border-b border-meta-border bg-meta-card/20 px-4 py-3">
        {selection ? (
          <div className="space-y-1 text-sm text-meta-muted">
            <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-meta-muted">
              <Badge variant="secondary">{selection.conversation.type}</Badge>
              <span>{selection.threadSubject || 'Thread'}</span>
            </div>
            <div className="text-xs text-meta-muted">
              Thread started {new Date(selection.threadMessages[0]?.created_at ?? selection.message.created_at).toLocaleString()}
              <span className="mx-1">&bull;</span>
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
          readerSearch.trim() && filteredMessages.length === 0 ? (
            <div className="text-sm text-meta-muted">No messages match your search.</div>
          ) : readerSearch.trim() ? (
            <div className="space-y-4">
              {filteredMessages.map((msg) => (
                <MessageViewer
                  key={msg.id}
                  senderName={msg.sender_name || msg.sender_email || 'Unknown sender'}
                  createdAt={new Date(msg.created_at).toLocaleString()}
                  body={msg.body}
                  highlightQuery={readerSearch}
                />
              ))}
            </div>
          ) : (
            <MessageViewer
              senderName={selection.message.sender_name || selection.message.sender_email || 'Unknown sender'}
              createdAt={new Date(selection.message.created_at).toLocaleString()}
              body={selection.message.body}
            />
          )
        ) : (
          <div className="text-sm text-meta-muted">Pick a message from the inbox to read the contents here.</div>
        )}
      </div>
    </div>
  )
}
