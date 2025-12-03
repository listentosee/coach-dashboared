'use client'

import { useEffect, useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { getFileIcon } from '@/lib/utils/file-icons'
import { cn } from '@/lib/utils'

export type CoachLibraryDocument = {
  id: string
  description: string
  file_name: string
  content_type: string | null
  file_path: string
  downloadUrl: string | null
  updated_at: string
}

const getDisplayFileName = (fileName: string) => {
  const base = fileName.split('/').pop() || fileName
  const trimmed = base.replace(/\.[^.]+$/, '')
  return trimmed || base
}

interface CoachLibraryModalProps {
  open: boolean
  onClose: () => void
}

export function CoachLibraryModal({ open, onClose }: CoachLibraryModalProps) {
  const [documents, setDocuments] = useState<CoachLibraryDocument[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let ignore = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/coach-library')
        if (!res.ok) {
          throw new Error('Failed to load documents')
        }
        const data = await res.json()
        if (!ignore) {
          setDocuments(data.documents || [])
        }
      } catch (err: any) {
        if (!ignore) {
          setError(err?.message || 'Unable to load library')
        }
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    void load()
    return () => {
      ignore = true
    }
  }, [open])

  const sortedDocuments = useMemo(() => {
    return [...documents].sort((a, b) => a.description.localeCompare(b.description))
  }, [documents])

  const handleOpenDocument = (doc: CoachLibraryDocument) => {
    if (doc.downloadUrl) {
      window.open(doc.downloadUrl, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Coach Resource Library</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-meta-muted">
            Download coaching playbooks, guides, and reference documents to support your team. All files are updated by the program administrators.
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-10 text-meta-muted">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading library…
            </div>
          ) : error ? (
            <div className="rounded-md border border-red-500/60 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          ) : sortedDocuments.length === 0 ? (
            <div className="rounded-md border border-meta-border bg-meta-dark/60 px-3 py-4 text-sm text-meta-muted">
              No documents available yet. Check back soon!
            </div>
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {sortedDocuments.map((doc) => {
                const { Icon, hasFill } = getFileIcon(doc.file_name || doc.content_type || '')
                const displayFileName = getDisplayFileName(doc.file_name)
                return (
                  <button
                    key={doc.id}
                    onClick={() => handleOpenDocument(doc)}
                    className="w-full flex items-center gap-3 rounded-md border border-meta-border bg-meta-dark/40 px-3 py-3 text-left hover:bg-meta-accent/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-meta-accent"
                  >
                    <span className={cn('flex h-10 w-10 items-center justify-center rounded-md', hasFill ? '' : 'bg-meta-card text-meta-light')}>
                      <Icon className={cn('h-6 w-6', hasFill ? '' : '')} />
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-medium text-meta-light">{displayFileName}</span>
                      <span className="block text-xs text-meta-muted">{doc.description}</span>
                    </span>
                    <span className="text-xs text-meta-muted">
                      {new Date(doc.updated_at).toLocaleDateString()}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="ghost" onClick={onClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
