"use client"

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Filter, MessageSquare, Users, PenSquare } from 'lucide-react'

export type ConversationType = 'dm' | 'group' | 'announcement'
export type InboxListMode = 'threads' | 'messages'
export type InboxViewMode = 'all' | 'unread'

const typeMeta: Record<ConversationType, { label: string; icon: typeof MessageSquare }> = {
  announcement: { label: 'Announcements', icon: MessageSquare },
  group: { label: 'Groups', icon: Users },
  dm: { label: 'Direct', icon: MessageSquare },
}

export type InboxActionBarProps = {
  listMode: InboxListMode
  onListModeChange: (mode: InboxListMode) => void
  viewMode: InboxViewMode
  onViewModeChange: (view: InboxViewMode) => void
  filters: Record<ConversationType, boolean>
  onFiltersChange: (filters: Record<ConversationType, boolean>) => void
  onCompose?: (target: 'dm' | 'group') => void
}

export function InboxActionBar({
  listMode,
  onListModeChange,
  viewMode,
  onViewModeChange,
  filters,
  onFiltersChange,
  onCompose,
}: InboxActionBarProps) {
  const [filterMenuOpen, setFilterMenuOpen] = useState(false)
  const [sendMenuOpen, setSendMenuOpen] = useState(false)
  const filterMenuRef = useRef<HTMLDivElement | null>(null)
  const sendMenuRef = useRef<HTMLDivElement | null>(null)
  const unreadOnly = viewMode === 'unread'
  const conversationsChecked = !unreadOnly && listMode === 'threads'

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (filterMenuOpen && filterMenuRef.current && !filterMenuRef.current.contains(target)) {
        setFilterMenuOpen(false)
      }
      if (sendMenuOpen && sendMenuRef.current && !sendMenuRef.current.contains(target)) {
        setSendMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [filterMenuOpen, sendMenuOpen])

  const toggleFilter = (type: ConversationType) => {
    const next = { ...filters, [type]: !filters[type] }
    if (!next.announcement && !next.group && !next.dm) return
    onFiltersChange(next)
  }

  const handleUnreadToggle = (next: boolean | "indeterminate") => {
    const checked = next === true
    onViewModeChange(checked ? 'unread' : 'all')
    if (checked) onListModeChange('messages')
  }

  const handleConversationsToggle = (next: boolean | "indeterminate") => {
    const checked = next === true
    onListModeChange(checked ? 'threads' : 'messages')
  }

  return (
    <div className="flex items-center gap-3 border-b border-meta-border bg-meta-card/40 px-4 py-3">
      <label className="flex items-center gap-2 text-xs font-medium text-meta-light">
        <Checkbox
          checked={conversationsChecked}
          onCheckedChange={handleConversationsToggle}
          disabled={unreadOnly}
        />
        Conversations
      </label>

      <div className="relative" ref={filterMenuRef}>
        <Button
          size="sm"
          variant="secondary"
          className="text-xs"
          onClick={() => setFilterMenuOpen((open) => !open)}
        >
          <Filter className="mr-2 h-4 w-4" />
          Filters
        </Button>
        {filterMenuOpen ? (
          <div className="absolute left-0 z-20 mt-2 w-56 rounded-md border border-meta-border bg-meta-card p-2 shadow-lg">
            <div className="mb-1 rounded px-2 py-1 text-xs uppercase tracking-wide text-meta-muted">
              Visibility
            </div>
            <label className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-meta-dark/10">
              <Checkbox checked={unreadOnly} onCheckedChange={handleUnreadToggle} />
              <span>Unread only</span>
            </label>
            <div className="mt-3 mb-1 rounded px-2 py-1 text-xs uppercase tracking-wide text-meta-muted">
              Conversation Types
            </div>
            {(Object.keys(typeMeta) as ConversationType[]).map((type) => (
              <label
                key={type}
                className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-meta-dark/10"
                style={unreadOnly ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
              >
                <Checkbox
                  checked={filters[type]}
                  onCheckedChange={() => toggleFilter(type)}
                  disabled={unreadOnly}
                />
                <span>{typeMeta[type].label}</span>
              </label>
            ))}
          </div>
        ) : null}
      </div>

      <div className="relative ml-auto" ref={sendMenuRef}>
        <Button size="sm" className="text-xs" onClick={() => setSendMenuOpen((open) => !open)}>
          <PenSquare className="mr-2 h-4 w-4" />
          New
        </Button>
        {sendMenuOpen ? (
          <div className="absolute right-0 z-20 mt-2 w-44 rounded-md border border-meta-border bg-meta-card py-1 shadow-lg">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-meta-dark/10"
              onClick={() => {
                setSendMenuOpen(false)
                onCompose?.('dm')
              }}
            >
              <MessageSquare className="h-4 w-4" />
              Direct message
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-meta-dark/10"
              onClick={() => {
                setSendMenuOpen(false)
                onCompose?.('group')
              }}
            >
              <Users className="h-4 w-4" />
              Group message
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
