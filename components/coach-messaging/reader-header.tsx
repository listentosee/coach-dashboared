"use client"

import { Button } from '@/components/ui/button'
import { Forward, Reply, Search } from 'lucide-react'

export type ReaderHeaderProps = {
  disabled?: boolean
  onReply?: () => void
  onForward?: () => void
  onSearchToggle?: () => void
  searchActive?: boolean
}

export function ReaderHeader({ disabled = false, onReply, onForward, onSearchToggle, searchActive }: ReaderHeaderProps) {
  return (
    <div className="flex items-center justify-end gap-2 border-b border-meta-border bg-meta-card/40 px-4 py-3">
      <Button
        size="sm"
        variant={searchActive ? 'default' : 'secondary'}
        disabled={disabled}
        onClick={onSearchToggle}
        title="Search in conversation"
        data-testid="reader-search-toggle"
      >
        <Search className="mr-2 h-4 w-4" />
        Search
      </Button>
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
