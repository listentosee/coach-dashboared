"use client"

import { Trash2 } from 'lucide-react'
import { useState } from 'react'

export type DraftActionsProps = {
  onDelete: () => void | Promise<void>
}

export function DraftActions({ onDelete }: DraftActionsProps) {
  const [loading, setLoading] = useState(false)

  const handleDelete = async (event: React.MouseEvent) => {
    event.stopPropagation()
    if (loading) return
    setLoading(true)
    try {
      await onDelete()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
      <div
        onClick={handleDelete}
        className="rounded p-1 hover:bg-meta-surface/80 text-meta-muted hover:text-meta-foreground transition-colors disabled:opacity-50 cursor-pointer"
        title="Delete draft"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleDelete(e as any)
          }
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </div>
    </div>
  )
}
