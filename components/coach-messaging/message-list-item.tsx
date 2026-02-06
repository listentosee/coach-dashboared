"use client"

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { ConversationActions } from './conversation-actions'
import { Flag } from 'lucide-react'

export type MessageListItemProps = {
  displayName: string
  timestamp: string
  preview?: string | null
  avatarColorClass: string
  initials: string
  unread?: boolean
  active?: boolean
  detailFooter?: ReactNode
  actions?: ReactNode
  conversationId?: string
  messageId?: string
  isFlagged?: boolean
  onFlagToggle?: (messageId: string, flagged: boolean) => void
  onArchive?: (conversationId: string) => void
} & ButtonHTMLAttributes<HTMLButtonElement>

export const MessageListItem = forwardRef<HTMLButtonElement, MessageListItemProps>(function MessageListItem(
  { displayName, timestamp, preview, avatarColorClass, initials, unread = false, active = false, detailFooter, actions, className, conversationId, messageId, isFlagged, onFlagToggle, onArchive, onClick, ...props },
  ref,
) {
  const handleFlagToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (messageId && onFlagToggle) {
      onFlagToggle(messageId, !isFlagged)
    }
  }

  return (
    <div className={cn('group flex w-full items-start gap-3 rounded-md px-2 py-2', active && 'bg-blue-500/20', className)}>
      <button
        ref={ref}
        type="button"
        className="flex flex-1 items-start gap-3 text-left transition-colors hover:bg-meta-card/80 rounded-md min-w-0"
        onClick={onClick}
        {...props}
      >
        <div className="relative shrink-0">
          <span
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold uppercase text-white',
              avatarColorClass,
            )}
          >
            {initials}
          </span>
          {isFlagged && messageId ? (
            <div
              onClick={handleFlagToggle}
              className="absolute -top-1 -right-1 text-red-500 hover:text-red-600 transition-colors bg-white rounded-full p-0.5 cursor-pointer"
              title="Unflag message"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleFlagToggle(e as any)
                }
              }}
            >
              <Flag className="h-3 w-3 fill-current" />
            </div>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="truncate font-medium text-meta-light">{displayName}</span>
            {unread ? <span className="inline-block h-2 w-2 rounded-full bg-blue-400" /> : null}
          </div>
          {preview ? <div className="text-[11px] text-meta-muted line-clamp-2">{preview}</div> : null}
          {detailFooter}
        </div>
      </button>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-[10px] text-meta-muted">{timestamp}</span>
        {actions ? (
          actions
        ) : conversationId && (onArchive || onFlagToggle) ? (
          <ConversationActions
            conversationId={conversationId}
            messageId={messageId}
            isFlagged={isFlagged}
            onArchive={onArchive}
            onFlagToggle={onFlagToggle}
          />
        ) : null}
      </div>
    </div>
  )
})
