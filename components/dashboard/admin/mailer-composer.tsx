"use client"

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import MarkdownEditor from '@/components/ui/markdown-editor'
import { Mail, AlertTriangle, CheckCircle2, Save, FileText, Trash2, FilePlus } from 'lucide-react'
import { toast } from 'sonner'

type CoachOption = { id: string; full_name: string | null; email: string | null }
type DraftOption = { id: string; subject: string; body_markdown: string; created_at: string }

type DryRunResult = {
  recipientCount: number
  skippedCount: number
  skippedReasons?: Record<string, number>
}

type SendResult = {
  campaignId: string
  recipientCount: number
  skippedCount: number
}

type MailerComposerProps = {
  coaches?: CoachOption[]
  drafts?: DraftOption[]
}

export function MailerComposer({ coaches = [], drafts = [] }: MailerComposerProps) {
  const router = useRouter()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [preview, setPreview] = useState(false)
  const [coachId, setCoachId] = useState('')
  const [dryRunLoading, setDryRunLoading] = useState(false)
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sendLoading, setSendLoading] = useState(false)
  const [sendResult, setSendResult] = useState<SendResult | null>(null)
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)
  const [draftSaving, setDraftSaving] = useState(false)

  const canSubmit = subject.trim().length > 0 && body.trim().length > 0
  const selectedCoach = coaches.find((c) => c.id === coachId) ?? null
  const coachLabel = selectedCoach ? (selectedCoach.full_name || selectedCoach.email || selectedCoach.id) : null

  const handleDryRun = useCallback(async () => {
    setDryRunLoading(true)
    setDryRunResult(null)
    try {
      const res = await fetch('/api/messaging/announcements/competitors/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body, dryRun: true, coachId: coachId || undefined }),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => null)
        throw new Error(errBody?.error || 'Failed to preview recipients')
      }
      const data = await res.json()
      setDryRunResult({
        recipientCount: data.recipientCount,
        skippedCount: data.skippedCount,
        skippedReasons: data.skippedReasons,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to preview recipients')
    } finally {
      setDryRunLoading(false)
    }
  }, [subject, body, coachId])

  const handleSend = useCallback(async () => {
    setSendLoading(true)
    setConfirmOpen(false)
    try {
      const res = await fetch('/api/messaging/announcements/competitors/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body, coachId: coachId || undefined }),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => null)
        throw new Error(errBody?.error || 'Failed to send competitor announcement')
      }
      const data = await res.json()
      setSendResult({
        campaignId: data.campaignId,
        recipientCount: data.recipientCount,
        skippedCount: data.skippedCount,
      })
      // If sent from a draft, discard it silently
      if (activeDraftId) {
        await fetch(`/api/messaging/announcements/competitors/drafts/${activeDraftId}`, { method: 'DELETE' }).catch(() => {})
        setActiveDraftId(null)
      }
      toast.success('Competitor announcement queued for delivery')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send competitor announcement')
    } finally {
      setSendLoading(false)
    }
  }, [subject, body, coachId, activeDraftId, router])

  const handleSaveDraft = useCallback(async () => {
    setDraftSaving(true)
    try {
      const res = await fetch('/api/messaging/announcements/competitors/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activeDraftId ?? undefined, subject, body }),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => null)
        throw new Error(errBody?.error || 'Failed to save draft')
      }
      const data = await res.json()
      setActiveDraftId(data.draft.id)
      toast.success('Draft saved')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save draft')
    } finally {
      setDraftSaving(false)
    }
  }, [activeDraftId, subject, body, router])

  const handleLoadDraft = useCallback((draft: DraftOption) => {
    setSubject(draft.subject)
    setBody(draft.body_markdown)
    setActiveDraftId(draft.id)
    setDryRunResult(null)
    setConfirmOpen(false)
    setPreview(false)
    setSendResult(null)
  }, [])

  const handleDiscardDraft = useCallback(async () => {
    if (!activeDraftId) return
    if (!window.confirm('Discard this draft? This cannot be undone.')) return
    try {
      const res = await fetch(`/api/messaging/announcements/competitors/drafts/${activeDraftId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to discard draft')
      setActiveDraftId(null)
      setSubject('')
      setBody('')
      setPreview(false)
      setDryRunResult(null)
      setConfirmOpen(false)
      toast.success('Draft discarded')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to discard draft')
    }
  }, [activeDraftId, router])

  const handleNewDraft = useCallback(() => {
    setSubject('')
    setBody('')
    setPreview(false)
    setDryRunResult(null)
    setConfirmOpen(false)
    setActiveDraftId(null)
  }, [])

  const handleReset = useCallback(() => {
    setSubject('')
    setBody('')
    setPreview(false)
    setCoachId('')
    setDryRunResult(null)
    setConfirmOpen(false)
    setSendResult(null)
    setActiveDraftId(null)
  }, [])

  // Success state
  if (sendResult) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-emerald-200">
              Competitor announcement queued for email delivery.
            </p>
            <div className="text-xs text-slate-400 space-y-0.5">
              <div>Recipients queued: <span className="font-medium text-slate-200">{sendResult.recipientCount}</span></div>
              {sendResult.skippedCount > 0 && (
                <div>Skipped: <span className="font-medium text-yellow-400">{sendResult.skippedCount}</span></div>
              )}
            </div>
          </div>
        </div>
        <Button variant="secondary" onClick={handleReset}>
          Compose Another
        </Button>
      </div>
    )
  }

  return (
    <div className="relative space-y-4">
      {/* Info banner */}
      <div className="flex items-center gap-2 rounded-md border border-slate-600 bg-slate-800/60 px-3 py-2 text-sm text-slate-300">
        <Mail className="h-4 w-4 shrink-0 text-slate-400" />
        <span>
          {coachId && coachLabel
            ? `Email will be sent to ${coachLabel}'s competitors only.`
            : 'Email will be sent to all competitors on the game platform.'}
        </span>
      </div>

      {/* Coach filter */}
      {coaches.length > 0 && (
        <div className="flex items-center gap-2">
          <label htmlFor="coach-filter" className="text-sm text-slate-400 shrink-0">Send to:</label>
          <select
            id="coach-filter"
            value={coachId}
            onChange={(e) => { setCoachId(e.target.value); setDryRunResult(null) }}
            className="flex-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
          >
            <option value="">All competitors</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name || c.email || c.id}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Draft loader */}
      {drafts.length > 0 && (
        <div className="flex items-center gap-2">
          <label htmlFor="draft-loader" className="text-sm text-slate-400 shrink-0">
            <FileText className="inline h-3.5 w-3.5 mr-1" />
            Load draft:
          </label>
          <select
            id="draft-loader"
            value={activeDraftId ?? ''}
            onChange={(e) => {
              const draft = drafts.find((d) => d.id === e.target.value)
              if (draft) handleLoadDraft(draft)
            }}
            className="flex-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
          >
            <option value="">Select a draft...</option>
            {drafts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.subject || '(no subject)'} — {new Date(d.created_at).toLocaleDateString()}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Subject */}
      <Input
        placeholder="Subject (required)"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
      />

      {/* Toolbar */}
      <div className="flex items-center justify-end">
        <Button size="sm" variant="ghost" onClick={() => setPreview((p) => !p)}>
          {preview ? 'Edit Markdown' : 'Preview Markdown'}
        </Button>
      </div>

      {/* Editor */}
      <div className="rounded-md border border-slate-700 bg-slate-800/40 p-1">
        <MarkdownEditor
          value={body}
          onChange={setBody}
          preview={preview}
          height={300}
        />
      </div>

      {/* Dry-run result */}
      {dryRunResult && (
        <div className="rounded-md border border-slate-600 bg-slate-800/60 px-3 py-2 text-sm text-slate-300 space-y-1">
          <div>Recipients: <span className="font-medium text-slate-100">{dryRunResult.recipientCount}</span></div>
          {dryRunResult.skippedCount > 0 && (
            <div>Skipped: <span className="font-medium text-yellow-400">{dryRunResult.skippedCount}</span>
              {dryRunResult.skippedReasons && Object.keys(dryRunResult.skippedReasons).length > 0 && (
                <span className="ml-1 text-xs text-slate-400">
                  ({Object.entries(dryRunResult.skippedReasons).map(([reason, count]) => `${reason}: ${count}`).join(', ')})
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* Draft controls - left side */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleNewDraft}
          disabled={draftSaving || sendLoading}
          title="Clear form and start a new draft"
        >
          <FilePlus className="mr-1.5 h-3.5 w-3.5" />
          New
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleSaveDraft()}
          disabled={draftSaving || sendLoading || !canSubmit}
        >
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {draftSaving ? 'Saving...' : activeDraftId ? 'Update Draft' : 'Save Draft'}
        </Button>
        {activeDraftId && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleDiscardDraft()}
            disabled={draftSaving || sendLoading}
            className="text-red-400 hover:text-red-300"
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Discard Draft
          </Button>
        )}

        <div className="flex-1" />

        {/* Send controls - right side */}
        <Button
          variant="secondary"
          onClick={() => void handleDryRun()}
          disabled={dryRunLoading || sendLoading || !canSubmit}
        >
          {dryRunLoading ? 'Loading...' : 'Preview Recipients'}
        </Button>
        <Button
          onClick={() => setConfirmOpen(true)}
          disabled={sendLoading || dryRunLoading || !canSubmit || dryRunResult === null}
        >
          {sendLoading ? 'Sending...' : 'Send Email'}
        </Button>
      </div>

      {/* Confirmation overlay */}
      {confirmOpen && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-black/60">
          <div className="mx-4 w-full max-w-md rounded-lg border border-slate-600 bg-slate-900 p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-400" />
              <div className="space-y-2">
                <h3 className="text-base font-semibold text-slate-100">Confirm Send</h3>
                <p className="text-sm text-slate-300">
                  Send email to <span className="font-semibold text-slate-100">{dryRunResult?.recipientCount ?? '?'}</span>{' '}
                  {coachId && coachLabel
                    ? `of ${coachLabel}'s competitors`
                    : `competitor${(dryRunResult?.recipientCount ?? 0) !== 1 ? 's' : ''}`}?
                </p>
                {(dryRunResult?.skippedCount ?? 0) > 0 && (
                  <p className="text-xs text-slate-400">
                    {dryRunResult!.skippedCount} competitor{dryRunResult!.skippedCount !== 1 ? 's' : ''} will be skipped due to missing or invalid email.
                  </p>
                )}
                <p className="text-xs text-slate-500">This action cannot be undone.</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => void handleSend()}>
                Confirm Send
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
