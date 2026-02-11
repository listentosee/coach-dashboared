"use client"

import { Undo2 } from 'lucide-react'
import { useState } from 'react'

export type ArchivedActionsProps = {
  onRestore: () => void | Promise<void>
}

export function ArchivedActions({ onRestore }: ArchivedActionsProps) {
  const [loading, setLoading] = useState(false)

  const handleRestore = async (event: React.MouseEvent) => {
    event.stopPropagation()
    if (loading) return
    setLoading(true)
    try {
      await onRestore()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
      <div
        onClick={handleRestore}
        className="rounded p-1 hover:bg-slate-700/80 text-slate-400 hover:text-slate-100 transition-colors cursor-pointer"
        title="Restore message"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleRestore(e as any)
          }
        }}
      >
        <Undo2 className="h-3.5 w-3.5" />
      </div>
    </div>
  )
}
