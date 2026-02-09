"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import MarkdownEditor from '@/components/ui/markdown-editor'
import { useMemo, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import type { CoachComposerController, ComposerMode } from '@/lib/coach-messaging/use-coach-composer'
import type { CoachDirectoryUser } from '@/lib/coach-messaging/types'

const modeTitle: Record<ComposerMode, string> = {
  dm: 'New Direct Message',
  group: 'New Group Message',
  announcement: 'New Coach Announcement',
  reply: 'Reply',
  forward: 'Forward Message',
}

type CoachComposerModalProps = {
  controller: CoachComposerController
  directory: CoachDirectoryUser[]
}

/** Multi-select dropdown for group/forward recipients */
function MultiRecipientSelect({
  directory,
  groupRecipients,
  toggleGroupRecipient,
}: {
  directory: CoachDirectoryUser[]
  groupRecipients: Record<string, boolean>
  toggleGroupRecipient: (id: string, present: boolean) => void
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const selected = directory.filter((u) => groupRecipients[u.id])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setDropdownOpen((o) => !o)}
        className="flex min-h-[40px] w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <span className="flex flex-1 flex-wrap gap-1">
          {selected.length === 0 ? (
            <span className="text-muted-foreground">Select recipients…</span>
          ) : (
            selected.map((u) => (
              <span
                key={u.id}
                className="inline-flex items-center gap-1 rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-200"
              >
                {u.displayName}
                <X
                  className="h-3 w-3 cursor-pointer hover:text-white"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleGroupRecipient(u.id, false)
                  }}
                />
              </span>
            ))
          )}
        </span>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </button>

      {dropdownOpen && (
        <>
          {/* Invisible backdrop to close dropdown */}
          <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-md border bg-popover shadow-md">
            {directory.map((user) => (
              <label
                key={user.id}
                className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-accent"
              >
                <Checkbox
                  checked={!!groupRecipients[user.id]}
                  onCheckedChange={(checked) => toggleGroupRecipient(user.id, !!checked)}
                />
                <span className="flex-1">
                  <span className="block font-medium">{user.displayName}</span>
                  {user.email ? (
                    <span className="block text-xs text-muted-foreground">{user.email}</span>
                  ) : null}
                </span>
              </label>
            ))}
            {directory.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">No recipients available.</div>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}

export function CoachComposerModal({ controller, directory }: CoachComposerModalProps) {
  const {
    open,
    mode,
    close,
    loading,
    error,
    sendState,
    resetError,
    body,
    setBody,
    subject,
    setSubject,
    preview,
    togglePreview,
    highPriority,
    setHighPriority,
    dmRecipientId,
    lockDmRecipient,
    setDmRecipient,
    groupRecipients,
    toggleGroupRecipient,
    handleFiles,
    send,
    saveDraft,
    discardDraft,
  } = controller
  const isSuccess = sendState === 'success'

  const fileInputId = useMemo(() => `coach-composer-files-${Math.random().toString(36).slice(2)}`, [])

  const selectedGroupCount = useMemo(() => Object.values(groupRecipients).filter(Boolean).length, [groupRecipients])

  const lockedRecipient = useMemo(() => {
    if (!lockDmRecipient || !dmRecipientId) return null
    return directory.find((user) => user.id === dmRecipientId) || null
  }, [lockDmRecipient, dmRecipientId, directory])

  return (
    <Dialog open={open} onOpenChange={(next) => { if (next) return }}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] flex flex-col [&>button]:hidden"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {isSuccess ? 'Message Sent' : modeTitle[mode]}
          </DialogTitle>
        </DialogHeader>

        {isSuccess ? (
          <div className="space-y-6">
            <div className="rounded-md border border-meta-border bg-meta-dark/60 px-4 py-3 text-sm text-meta-light">
              Your message was delivered successfully. You can return to the inbox when you are ready.
            </div>
            <div className="flex justify-end gap-2">
              <Button onClick={() => close()}>OK</Button>
            </div>
          </div>
        ) : (
        <div className="flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto pr-1">
          {mode === 'dm' && !lockDmRecipient ? (
            <div>
              <div className="mb-2 text-xs uppercase text-meta-muted">To</div>
              <Select value={dmRecipientId || ''} onValueChange={(val) => setDmRecipient(val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select recipient..." />
                </SelectTrigger>
                <SelectContent>
                  {directory.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      <span className="flex items-center gap-2">
                        <span>{user.displayName}</span>
                        {user.email ? (
                          <span className="text-xs text-muted-foreground">({user.email})</span>
                        ) : null}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {directory.length === 0 ? (
                <div className="mt-1 text-xs text-meta-muted">No recipients available.</div>
              ) : null}
            </div>
          ) : null}

          {mode === 'dm' && lockDmRecipient ? (
            <div className="rounded-md border border-meta-border bg-meta-dark/50 px-3 py-2 text-sm text-meta-light">
              {lockedRecipient ? (
                <span>Replying to <strong>{lockedRecipient.displayName}</strong></span>
              ) : (
                <span>Replying to selected recipient.</span>
              )}
            </div>
          ) : null}

          {mode === 'group' || mode === 'forward' ? (
            <div>
              <div className="mb-2 text-xs uppercase text-meta-muted">
                To {selectedGroupCount > 0 ? `(${selectedGroupCount} selected)` : ''}
              </div>
              <MultiRecipientSelect
                directory={directory}
                groupRecipients={groupRecipients}
                toggleGroupRecipient={toggleGroupRecipient}
              />
            </div>
          ) : mode === 'announcement' ? (
            <div className="space-y-2">
              <div className="text-xs text-meta-muted">Announcement will be sent to all coaches.</div>
            </div>
          ) : null}

          {(mode === 'dm' || mode === 'group' || mode === 'forward' || mode === 'announcement') ? (
            <Input
              placeholder={mode === 'forward' || mode === 'announcement' ? 'Subject' : 'Subject (optional)'}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          ) : null}

          <div className="flex items-center justify-between text-xs text-meta-muted">
            <div>
              {mode === 'group' ? `${selectedGroupCount} recipient${selectedGroupCount === 1 ? '' : 's'} selected` : null}
            </div>
            <div className="flex items-center gap-2">
              <input id={fileInputId} type="file" hidden multiple onChange={(event) => handleFiles(event.target.files)} />
              <Button size="sm" variant="secondary" onClick={() => document.getElementById(fileInputId)?.click()}>
                Attach
              </Button>
              <Button size="sm" variant="ghost" onClick={togglePreview}>
                {preview ? 'Edit Markdown' : 'Preview Markdown'}
              </Button>
            </div>
          </div>

          {mode !== 'announcement' ? (
            <label className="flex items-center gap-2 text-xs text-meta-muted">
              <Checkbox
                checked={highPriority}
                onCheckedChange={(checked) => setHighPriority(!!checked)}
              />
              <span>High priority (notify admins immediately)</span>
            </label>
          ) : null}

          <div className="min-h-0 rounded-md border border-meta-border bg-meta-dark/60 p-1">
            <MarkdownEditor
              value={body}
              onChange={setBody}
              preview={preview}
              height={360}
            />
          </div>

          {error ? (
            <div className="rounded-md border border-red-500/60 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
              <button className="ml-3 underline" onClick={resetError}>Dismiss</button>
            </div>
          ) : null}
        </div>
        )}

        {/* Action buttons pinned at bottom, outside scroll area */}
        {!isSuccess && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-meta-border pt-4">
            <Button
              variant="secondary"
              onClick={async () => {
                const saved = await saveDraft()
                if (saved) close()
              }}
              disabled={loading}
            >
              Save Draft
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                const discarded = await discardDraft()
                if (discarded) close()
              }}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void send()}
              disabled={
                loading ||
                body.trim().length === 0 ||
                (mode === 'dm' && !dmRecipientId) ||
                ((mode === 'group' || mode === 'forward') && selectedGroupCount === 0) ||
                (mode === 'announcement' && !subject.trim())
              }
            >
              {loading ? 'Sending...' : 'Send'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
