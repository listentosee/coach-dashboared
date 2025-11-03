'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { getFileIcon } from '@/lib/utils/file-icons'
import { cn } from '@/lib/utils'
import type { CoachLibraryDocument } from '@/components/coach-library/CoachLibraryModal'
import { supabase } from '@/lib/supabase/client'
import { Loader2, Upload, RefreshCcw, Trash2, FilePenLine } from 'lucide-react'

export function CoachLibraryManager() {
  const [documents, setDocuments] = useState<CoachLibraryDocument[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [description, setDescription] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const fetchDocuments = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/coach-library')
      if (!res.ok) throw new Error('Failed to load documents')
      const data = await res.json()
      setDocuments(data.documents || [])
    } catch (err: any) {
      setError(err?.message || 'Unable to load documents')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchDocuments()
  }, [fetchDocuments])

  const sortedDocuments = useMemo(() => {
    return [...documents].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  }, [documents])

  const handleUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!fileInputRef.current || !fileInputRef.current.files || fileInputRef.current.files.length === 0) {
      setError('Choose a file to upload')
      return
    }
    if (!description.trim()) {
      setError('Add a description for the document')
      return
    }
    setUploading(true)
    setError(null)
    try {
      const file = fileInputRef.current.files[0]
      const descriptionValue = description.trim()

      const prepareRes = await fetch('/api/admin/coach-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase: 'prepare',
          fileName: file.name,
          contentType: file.type || null,
          description: descriptionValue,
        }),
      })
      if (!prepareRes.ok) {
        const json = await prepareRes.json().catch(() => ({}))
        throw new Error(json?.error || 'Unable to prepare upload')
      }

      const prepare = await prepareRes.json() as { path: string }
      const path = prepare.path

      const { error: uploadError } = await supabase.storage.from('coach-library').upload(path, file, {
        upsert: false,
        cacheControl: '3600',
      })
      if (uploadError) {
        throw new Error(uploadError.message)
      }

      const finalizeRes = await fetch('/api/admin/coach-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase: 'finalize',
          path,
          description: descriptionValue,
          fileName: file.name,
          contentType: file.type || null,
        }),
      })

      if (!finalizeRes.ok) {
        const json = await finalizeRes.json().catch(() => ({}))
        await supabase.storage.from('coach-library').remove([path])
        throw new Error(json?.error || 'Failed to finalize document')
      }

      setDescription('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      await fetchDocuments()
    } catch (err: any) {
      setError(err?.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleReplace = async (doc: CoachLibraryDocument, file: File) => {
    setUploading(true)
    setError(null)
    try {
      const { error: uploadError } = await supabase.storage.from('coach-library').upload(doc.file_path, file, {
        upsert: true,
        cacheControl: '3600',
      })
      if (uploadError) {
        throw new Error(uploadError.message)
      }

      const res = await fetch(`/api/admin/coach-library/${doc.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          replace: true,
          fileName: file.name,
          contentType: file.type || null,
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error || 'Failed to update document')
      }
      await fetchDocuments()
    } catch (err: any) {
      setError(err?.message || 'Failed to update document')
    } finally {
      setUploading(false)
    }
  }

  const replaceInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const triggerReplace = (id: string) => {
    const node = replaceInputRefs.current[id]
    node?.click()
  }

  const handleDelete = async (doc: CoachLibraryDocument) => {
    if (!confirm(`Delete "${doc.description}"? This cannot be undone.`)) return
    setUploading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/coach-library/${doc.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error || 'Failed to delete document')
      }
      await fetchDocuments()
    } catch (err: any) {
      setError(err?.message || 'Failed to delete document')
    } finally {
      setUploading(false)
    }
  }

  const handleOpen = (doc: CoachLibraryDocument) => {
    if (doc.downloadUrl) {
      window.open(doc.downloadUrl, '_blank', 'noopener,noreferrer')
    }
  }

  const handleDescriptionChange = async (doc: CoachLibraryDocument, next: string) => {
    setUploading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/coach-library/${doc.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: next.trim() }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error || 'Failed to update description')
      }
      await fetchDocuments()
    } catch (err: any) {
      setError(err?.message || 'Failed to update description')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Coach Library</h1>
        <p className="text-sm text-muted-foreground">
          Manage the resource documents available to coaches. Upload new guides, replace existing versions, or remove outdated files. Changes are reflected immediately for all coaches.
        </p>
      </div>

      <form onSubmit={handleUpload} className="rounded-md border border-border bg-card/60 p-4 space-y-3">
        <div className="text-sm font-medium text-foreground">Upload new document</div>
        <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Document description (shown to coaches)"
            className="min-h-[80px]"
          />
          <div className="flex flex-col gap-2">
            <Input type="file" ref={fileInputRef} accept="*/*" />
            <Button type="submit" disabled={uploading}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}Upload
            </Button>
          </div>
        </div>
      </form>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-foreground">Existing documents</h2>
        <Button variant="ghost" size="sm" onClick={() => void fetchDocuments()} disabled={loading || uploading}>
          <RefreshCcw className="mr-2 h-4 w-4" />Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border border-red-500/60 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading documents…
        </div>
      ) : sortedDocuments.length === 0 ? (
        <div className="rounded-md border border-border bg-card/60 px-3 py-4 text-sm text-muted-foreground">
          No documents uploaded yet.
        </div>
      ) : (
        <div className="space-y-3">
          {sortedDocuments.map((doc) => {
            const { Icon, hasFill } = getFileIcon(doc.file_name || doc.content_type || '')
            return (
              <div key={doc.id} className="rounded-md border border-border bg-card/60 p-3">
                <div className="flex items-start gap-3">
                  <span className={cn('flex h-10 w-10 items-center justify-center rounded-md', hasFill ? '' : 'bg-meta-dark text-meta-light')}>
                    <Icon className="h-6 w-6" />
                  </span>
                  <div className="flex-1 space-y-1">
                    <Textarea
                      defaultValue={doc.description}
                      onBlur={(e) => {
                        const next = e.target.value.trim()
                        if (next && next !== doc.description) {
                          void handleDescriptionChange(doc, next)
                        } else {
                          e.target.value = doc.description
                        }
                      }}
                      className="min-h-[60px]"
                    />
                    <div className="text-xs text-muted-foreground">
                      {doc.file_name} · Updated {new Date(doc.updated_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button variant="secondary" size="sm" onClick={() => handleOpen(doc)}>
                      Open
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => triggerReplace(doc.id)} disabled={uploading}>
                      <FilePenLine className="mr-2 h-4 w-4" />Replace
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => void handleDelete(doc)} disabled={uploading}>
                      <Trash2 className="mr-2 h-4 w-4" />Delete
                    </Button>
                    <input
                      type="file"
                      accept="*/*"
                      hidden
                      ref={(node) => { replaceInputRefs.current[doc.id] = node }}
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) {
                          void handleReplace(doc, file)
                          event.target.value = ''
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
