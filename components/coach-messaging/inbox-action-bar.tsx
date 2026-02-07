"use client"

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Inbox,
  MailOpen,
  Flag,
  FileText,
  Archive,
  Filter,
  MessageSquare,
  MessagesSquare,
  Users,
  PenSquare,
  Megaphone,
} from 'lucide-react'

export type ConversationType = 'dm' | 'group' | 'announcement'
export type InboxListMode = 'threads' | 'messages'
export type InboxViewMode = 'all' | 'unread' | 'flagged' | 'drafts' | 'archived'

const typeMeta: Record<ConversationType, { label: string; icon: typeof MessageSquare }> = {
  dm: { label: 'Direct', icon: MessageSquare },
  group: { label: 'Groups', icon: Users },
  announcement: { label: 'Announcements', icon: Megaphone },
}

type ViewModeButton = {
  mode: InboxViewMode
  icon: typeof Inbox
  label: string
}

const viewModeButtons: ViewModeButton[] = [
  { mode: 'unread', icon: MailOpen, label: 'Unread' },
  { mode: 'flagged', icon: Flag, label: 'Flagged' },
  { mode: 'drafts', icon: FileText, label: 'Drafts' },
  { mode: 'archived', icon: Archive, label: 'Archived' },
]

export type InboxActionBarProps = {
  listMode: InboxListMode
  onListModeChange: (mode: InboxListMode) => void
  viewMode: InboxViewMode
  onViewModeChange: (view: InboxViewMode) => void
  filters: Record<ConversationType, boolean>
  onFiltersChange: (filters: Record<ConversationType, boolean>) => void
  draftsCount?: number
  unreadCount?: number
  onCompose?: (target: 'dm' | 'group' | 'announcement') => void
  onViewArchived?: () => void
  isAdmin?: boolean
}

export function InboxActionBar({
  listMode,
  onListModeChange,
  viewMode,
  onViewModeChange,
  filters,
  onFiltersChange,
  draftsCount = 0,
  unreadCount = 0,
  onCompose,
  onViewArchived,
  isAdmin = false,
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

  const handleViewModeClick = (mode: InboxViewMode) => {
    // If already on this mode, do nothing — use Inbox/Conversations tabs to go back
    if (viewMode === mode) return
    onViewModeChange(mode)

    // These views force messages list mode
    if (mode === 'unread' || mode === 'flagged' || mode === 'drafts') {
      onListModeChange('messages')
    }

    // Archived triggers the fetch callback
    if (mode === 'archived') {
      onListModeChange('messages')
      onViewArchived?.()
    }
  }

  const handleListModeClick = (mode: InboxListMode) => {
    // Clicking a list mode tab resets to "all" view and switches list mode
    if (viewMode !== 'all') {
      onViewModeChange('all')
    }
    onListModeChange(mode)
  }

  const getBadge = (mode: InboxViewMode): number | null => {
    if (mode === 'unread' && unreadCount > 0) return unreadCount
    if (mode === 'drafts' && draftsCount > 0) return draftsCount
    return null
  }

  return (
    <div className="flex items-center gap-1.5 border-b border-meta-border bg-meta-card/40 px-3 py-2" data-testid="inbox-action-bar">
      {/* List mode tabs: Inbox (messages) and Conversations (threads) */}
      <Button
        size="sm"
        variant={listMode === 'messages' ? 'secondary' : 'ghost'}
        className="h-8 w-8 p-0"
        onClick={() => handleListModeClick('messages')}
        title="Inbox"
        data-testid="list-mode-messages"
      >
        <Inbox className="h-4 w-4" />
      </Button>
      <Button
        size="sm"
        variant={listMode === 'threads' ? 'secondary' : 'ghost'}
        className="h-8 w-8 p-0"
        onClick={() => handleListModeClick('threads')}
        title="Conversations"
        data-testid="list-mode-threads"
      >
        <MessagesSquare className="h-4 w-4" />
      </Button>

      <div className="mx-1 h-5 w-px bg-meta-border" />

      {/* View mode buttons - radio-style: only one active at a time */}
      {viewModeButtons.map(({ mode, icon: Icon, label }) => {
        const isActive = viewMode === mode
        const badge = getBadge(mode)
        return (
          <div key={mode} className="relative">
            <Button
              size="sm"
              variant={isActive ? 'secondary' : 'ghost'}
              className="h-8 w-8 p-0"
              onClick={() => handleViewModeClick(mode)}
              title={label}
              data-testid={`view-mode-${mode}`}
              data-active={isActive ? 'true' : undefined}
            >
              <Icon className="h-4 w-4" />
            </Button>
            {badge != null && (
              <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-meta-accent px-1 text-[10px] font-semibold text-white pointer-events-none">
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </div>
        )
      })}

      <div className="mx-1 h-5 w-px bg-meta-border" />

      {/* Filter popover - conversation type filters */}
      <div className="relative" ref={filterMenuRef}>
        <Button
          size="sm"
          variant={filterMenuOpen ? 'secondary' : 'ghost'}
          className="h-8 w-8 p-0"
          onClick={() => setFilterMenuOpen((open) => !open)}
          title="Filter by conversation type"
          data-testid="filter-menu-button"
        >
          <Filter className="h-4 w-4" />
        </Button>
        {filterMenuOpen && (
          <div className="absolute left-0 z-20 mt-2 w-48 rounded-md border border-meta-border bg-meta-card p-2 shadow-lg">
            <div className="mb-1 rounded px-2 py-1 text-xs uppercase tracking-wide text-meta-muted">
              Conversation Types
            </div>
            {(Object.keys(typeMeta) as ConversationType[]).map((type) => {
              const { label, icon: TypeIcon } = typeMeta[type]
              return (
                <label
                  key={type}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-meta-dark/10 cursor-pointer"
                >
                  <Checkbox
                    checked={filters[type]}
                    onCheckedChange={() => toggleFilter(type)}
                  />
                  <TypeIcon className="h-3.5 w-3.5 text-meta-muted" />
                  <span>{label}</span>
                </label>
              )
            })}
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Compose menu */}
      <div className="relative" ref={sendMenuRef}>
        <Button
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => setSendMenuOpen((open) => !open)}
          title="Compose new message"
          data-testid="compose-button"
        >
          <PenSquare className="h-4 w-4" />
        </Button>
        {sendMenuOpen && (
          <div className="absolute right-0 z-20 mt-2 w-44 rounded-md border border-meta-border bg-meta-card py-1 shadow-lg">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-meta-dark/10"
              onClick={() => {
                setSendMenuOpen(false)
                onCompose?.('dm')
              }}
              data-testid="compose-dm"
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
              data-testid="compose-group"
            >
              <Users className="h-4 w-4" />
              Group message
            </button>
            {isAdmin && (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-meta-dark/10"
                onClick={() => {
                  setSendMenuOpen(false)
                  onCompose?.('announcement')
                }}
                data-testid="compose-announcement"
              >
                <Megaphone className="h-4 w-4" />
                Announcement
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
