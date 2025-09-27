"use client"

import { ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

export type InboxConversationRowProps = {
  title: string
  snippet?: string | null
  timestamp: string
  unreadCount?: number | null
  icon: LucideIcon
  active?: boolean
} & ButtonHTMLAttributes<HTMLButtonElement>

export const InboxConversationRow = forwardRef<HTMLButtonElement, InboxConversationRowProps>(function InboxConversationRow(
  { title, snippet, timestamp, unreadCount = 0, icon: Icon, active = false, className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'flex w-full items-start gap-3 rounded-md border border-transparent px-3 py-3 text-left transition-colors hover:bg-meta-card/70',
        active ? 'bg-blue-500/10 border-blue-500' : 'bg-transparent',
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          'mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-meta-card text-meta-muted',
          active && 'bg-blue-500/20 text-blue-200',
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-meta-light">{title}</span>
          {unreadCount ? (
            <span className="inline-flex shrink-0 items-center rounded-full bg-blue-500 px-2 text-[10px] font-medium text-white">
              {unreadCount}
            </span>
          ) : null}
        </div>
        {snippet ? <div className="mt-1 text-xs text-meta-muted line-clamp-1">{snippet}</div> : null}
        <div className="mt-1 text-[10px] text-meta-muted">{timestamp}</div>
      </div>
    </button>
  )
})
