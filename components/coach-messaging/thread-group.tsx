"use client"

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ConversationActions } from './conversation-actions'

export type ThreadGroupProps = {
  title: string
  messageCount: number
  timestamp: string
  unreadCount?: number | null
  icon: LucideIcon
  expanded?: boolean
  active?: boolean
  onToggle?: () => void
  children?: ReactNode
  expandable?: boolean
  onHeaderSelect?: () => void
  selected?: boolean
  subtitle?: string
  conversationId?: string
  onArchive?: (conversationId: string) => void
}

export function ThreadGroup({
  title,
  messageCount,
  timestamp,
  unreadCount = 0,
  icon: Icon,
  expanded = false,
  active = false,
  onToggle,
  children,
  expandable = true,
  onHeaderSelect,
  selected = false,
  subtitle,
  conversationId,
  onArchive,
}: ThreadGroupProps) {
  const handleClick = () => {
    if (expandable && onToggle) {
      onToggle()
      return
    }
    onHeaderSelect?.()
  }

  return (
    <div
      className={cn(
        'group rounded-md border border-meta-border bg-meta-card/30',
        (active || selected) && 'border-blue-500',
        expanded && 'bg-blue-500/10',
      )}
    >
      <div className="flex w-full items-start gap-3 px-3 py-2">
        <button
          type="button"
          onClick={handleClick}
          className="flex flex-1 items-start gap-3 text-left min-w-0"
        >
          <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-meta-dark/60 text-meta-muted">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1 text-xs text-meta-muted">
            <div className="flex items-center gap-2">
              <span className="line-clamp-1 font-medium text-meta-light">{title || 'New thread'}</span>
              {unreadCount ? (
                <span className="inline-flex items-center rounded-full bg-blue-500 px-2 text-[10px] font-medium text-white">
                  {unreadCount}
                </span>
              ) : null}
            </div>
            {subtitle ? <div className="text-[11px] text-meta-muted line-clamp-1">{subtitle}</div> : null}
            <div className="mt-1 flex items-center gap-2 text-[10px] text-meta-muted">
              <span>{timestamp}</span>
              <span className="ml-auto">{messageCount} message{messageCount === 1 ? '' : 's'}</span>
            </div>
          </div>
        </button>
        <div className="flex items-center gap-1 shrink-0 mt-1">
          {conversationId && onArchive ? (
            <ConversationActions
              conversationId={conversationId}
              onArchive={onArchive}
            />
          ) : null}
          {expandable ? (
            <button type="button" onClick={handleClick} className="p-1">
              <ChevronDown className={cn('h-4 w-4 transition-transform text-meta-muted', expanded ? 'rotate-180' : undefined)} />
            </button>
          ) : null}
        </div>
      </div>
      {expandable && expanded ? (
        <div className="space-y-1 border-t border-meta-border/60 bg-meta-card/50 px-3 py-2">{children}</div>
      ) : null}
    </div>
  )
}
