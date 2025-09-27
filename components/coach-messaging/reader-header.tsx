"use client"

import { Button } from '@/components/ui/button'
import { Forward, Reply } from 'lucide-react'

export type ReaderHeaderProps = {
  disabled?: boolean
  onReply?: () => void
  onForward?: () => void
}

export function ReaderHeader({ disabled = false, onReply, onForward }: ReaderHeaderProps) {
  return (
    <div className="flex items-center justify-end gap-2 border-b border-meta-border bg-meta-card/40 px-4 py-3">
      <Button size="sm" variant="secondary" disabled={disabled} onClick={onReply}>
        <Reply className="mr-2 h-4 w-4" />
        Reply
      </Button>
      <Button size="sm" variant="secondary" disabled={disabled} onClick={onForward}>
        <Forward className="mr-2 h-4 w-4" />
        Forward
      </Button>
    </div>
  )
}
