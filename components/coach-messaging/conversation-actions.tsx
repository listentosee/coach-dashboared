"use client"

import { Archive, BellOff, Bell, Flag, Pin, PinOff } from 'lucide-react'
import { useState } from 'react'

export type ConversationActionsProps = {
  conversationId: string
  messageId?: string
  isFlagged?: boolean
  isPinned?: boolean
  isMuted?: boolean
  onArchive?: (conversationId: string) => void
  onFlagToggle?: (messageId: string, flagged: boolean) => void
  onPinToggle?: (conversationId: string, pinned: boolean) => void
  onMuteToggle?: (conversationId: string, muted: boolean) => void
}

export function ConversationActions({
  conversationId,
  messageId,
  isFlagged,
  isPinned,
  isMuted,
  onArchive,
  onFlagToggle,
  onPinToggle,
  onMuteToggle,
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

  const handlePinToggle = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!onPinToggle || isLoading) return
    setIsLoading(true)
    try {
      await onPinToggle(conversationId, !isPinned)
    } finally {
      setIsLoading(false)
    }
  }

  const handleMuteToggle = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!onMuteToggle || isLoading) return
    setIsLoading(true)
    try {
      await onMuteToggle(conversationId, !isMuted)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
      {onPinToggle && (
        <div
          onClick={handlePinToggle}
          className={`rounded p-1 hover:bg-meta-surface/80 transition-colors cursor-pointer ${
            isPinned ? 'text-blue-400 hover:text-blue-500' : 'text-meta-muted hover:text-meta-foreground'
          }`}
          title={isPinned ? 'Unpin conversation' : 'Pin conversation'}
          role="button"
          tabIndex={0}
          data-testid="pin-toggle"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handlePinToggle(e as any)
            }
          }}
        >
          {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        </div>
      )}
      {onMuteToggle && (
        <div
          onClick={handleMuteToggle}
          className={`rounded p-1 hover:bg-meta-surface/80 transition-colors cursor-pointer ${
            isMuted ? 'text-amber-400 hover:text-amber-500' : 'text-meta-muted hover:text-meta-foreground'
          }`}
          title={isMuted ? 'Unmute conversation' : 'Mute conversation'}
          role="button"
          tabIndex={0}
          data-testid="mute-toggle"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleMuteToggle(e as any)
            }
          }}
        >
          {isMuted ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
        </div>
      )}
      {messageId && onFlagToggle && (
        <div
          onClick={handleFlagToggle}
          className={`rounded p-1 hover:bg-meta-surface/80 transition-colors cursor-pointer ${
            isFlagged ? 'text-red-500 hover:text-red-600' : 'text-meta-muted hover:text-meta-foreground'
          }`}
          title={isFlagged ? 'Unflag message' : 'Flag message'}
          role="button"
          tabIndex={0}
          data-testid="flag-toggle"
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
        className="rounded p-1 hover:bg-meta-surface/80 text-meta-muted hover:text-meta-foreground transition-colors cursor-pointer"
        title="Archive conversation"
        role="button"
        tabIndex={0}
        data-testid="archive-btn"
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
