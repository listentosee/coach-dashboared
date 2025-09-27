"use client"

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export type MessageListItemProps = {
  displayName: string
  timestamp: string
  preview?: string | null
  avatarColorClass: string
  initials: string
  unread?: boolean
  active?: boolean
  detailFooter?: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>

export const MessageListItem = forwardRef<HTMLButtonElement, MessageListItemProps>(function MessageListItem(
  { displayName, timestamp, preview, avatarColorClass, initials, unread = false, active = false, detailFooter, className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'flex w-full items-start gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-meta-card/80',
        active && 'bg-blue-500/20',
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold uppercase text-white',
          avatarColorClass,
        )}
      >
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="truncate font-medium text-meta-light">{displayName}</span>
          {unread ? <span className="inline-block h-2 w-2 rounded-full bg-blue-400" /> : null}
          <span className="ml-auto shrink-0 text-[10px] text-meta-muted">{timestamp}</span>
        </div>
        {preview ? <div className="text-[11px] text-meta-muted line-clamp-2">{preview}</div> : null}
        {detailFooter}
      </div>
    </button>
  )
})
