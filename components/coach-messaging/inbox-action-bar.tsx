"use client"

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Filter, MessageSquare, Users, SendHorizontal } from 'lucide-react'

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
  listModeDisabled?: boolean
}

export function InboxActionBar({
  listMode,
  onListModeChange,
  viewMode,
  onViewModeChange,
  filters,
  onFiltersChange,
  onCompose,
  listModeDisabled = false,
}: InboxActionBarProps) {
  const [filterMenuOpen, setFilterMenuOpen] = useState(false)
  const [sendMenuOpen, setSendMenuOpen] = useState(false)
  const filterMenuRef = useRef<HTMLDivElement | null>(null)
  const sendMenuRef = useRef<HTMLDivElement | null>(null)

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

  return (
    <div className="flex items-center gap-3 border-b border-meta-border bg-meta-card/40 px-4 py-3">
      <Select
        value={listMode}
        onValueChange={(value) => onListModeChange(value as InboxListMode)}
        disabled={listModeDisabled}
      >
        <SelectTrigger className="w-36 text-xs" aria-label="List mode">
          <SelectValue placeholder="Threads" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="threads">Threads</SelectItem>
          <SelectItem value="messages">Messages</SelectItem>
        </SelectContent>
      </Select>

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
          <div className="absolute left-0 z-20 mt-2 w-48 rounded-md border border-meta-border bg-meta-card p-2 shadow-lg">
            {(Object.keys(typeMeta) as ConversationType[]).map((type) => (
              <label
                key={type}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-meta-dark/10"
              >
                <Checkbox checked={filters[type]} onCheckedChange={() => toggleFilter(type)} />
                <span>{typeMeta[type].label}</span>
              </label>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2 text-xs text-meta-muted">
        <Switch
          id="coach-inbox-unread-toggle"
          checked={viewMode === 'unread'}
          onCheckedChange={(checked) => onViewModeChange(checked ? 'unread' : 'all')}
        />
        <label htmlFor="coach-inbox-unread-toggle" className="select-none">
          {viewMode === 'unread' ? 'Unread only' : 'Show all'}
        </label>
      </div>

      <div className="relative ml-auto" ref={sendMenuRef}>
        <Button size="sm" className="text-xs" onClick={() => setSendMenuOpen((open) => !open)}>
          <SendHorizontal className="mr-2 h-4 w-4" />
          Send
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
