"use client"

import { Archive, Flag } from 'lucide-react'
import { useState } from 'react'

export type ConversationActionsProps = {
  conversationId: string
  messageId?: string
  isFlagged?: boolean
  onArchive?: (conversationId: string) => void
  onFlagToggle?: (messageId: string, flagged: boolean) => void
}

export function ConversationActions({
  conversationId,
  messageId,
  isFlagged,
  onArchive,
  onFlagToggle,
}: ConversationActionsProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleArchive = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isLoading) return
    setIsLoading(true)
    try {
      await onArchive?.(conversationId)
    } finally {
      setIsLoading(false)
    }
  }

  const handleFlagToggle = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!messageId || !onFlagToggle || isLoading) return
    setIsLoading(true)
    try {
      await onFlagToggle(messageId, !isFlagged)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
      {messageId && onFlagToggle && (
        <div
          onClick={handleFlagToggle}
          className={`rounded p-1 hover:bg-meta-surface/80 transition-colors disabled:opacity-50 cursor-pointer ${
            isFlagged ? 'text-red-500 hover:text-red-600' : 'text-meta-muted hover:text-meta-foreground'
          }`}
          title={isFlagged ? 'Unflag message' : 'Flag message'}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleFlagToggle(e as any)
            }
          }}
        >
          <Flag className={`h-3.5 w-3.5 ${isFlagged ? 'fill-current' : ''}`} />
        </div>
      )}
      <div
        onClick={handleArchive}
        className="rounded p-1 hover:bg-meta-surface/80 text-meta-muted hover:text-meta-foreground transition-colors disabled:opacity-50 cursor-pointer"
        title="Archive conversation"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleArchive(e as any)
          }
        }}
      >
        <Archive className="h-3.5 w-3.5" />
      </div>
    </div>
  )
}
