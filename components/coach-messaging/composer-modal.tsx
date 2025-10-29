"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import MarkdownEditor from '@/components/ui/markdown-editor'
import { useMemo } from 'react'
import type { CoachComposerController, ComposerMode } from '@/lib/coach-messaging/use-coach-composer'
import type { CoachDirectoryUser } from '@/lib/coach-messaging/types'

const modeTitle: Record<ComposerMode, string> = {
  dm: 'New Direct Message',
  group: 'New Group Message',
  announcement: 'New Announcement',
  reply: 'Reply',
  forward: 'Forward Message',
}

type CoachComposerModalProps = {
  controller: CoachComposerController
  directory: CoachDirectoryUser[]
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
    dmRecipientId,
    lockDmRecipient,
    setDmRecipient,
    groupRecipients,
    toggleGroupRecipient,
    handleFiles,
    send,
  } = controller
  const isSuccess = sendState === 'success'

  const fileInputId = useMemo(() => `coach-composer-files-${Math.random().toString(36).slice(2)}`, [])

  const selectedGroupCount = useMemo(() => Object.values(groupRecipients).filter(Boolean).length, [groupRecipients])

  const lockedRecipient = useMemo(() => {
    if (!lockDmRecipient || !dmRecipientId) return null
    return directory.find((user) => user.id === dmRecipientId) || null
  }, [lockDmRecipient, dmRecipientId, directory])

  return (
    <Dialog open={open} modal={sendState !== 'success'} onOpenChange={(next) => { if (!next) close() }}>
      <DialogContent className={isSuccess ? 'max-w-2xl' : 'max-w-2xl overflow-y-auto'}>
        <DialogHeader>
          <DialogTitle>{isSuccess ? 'Message Sent' : modeTitle[mode]}</DialogTitle>
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
        <div className="space-y-4">
          {mode === 'dm' && !lockDmRecipient ? (
            <div>
              <div className="mb-2 text-xs uppercase text-meta-muted">Recipient</div>
              <div className="max-h-60 overflow-y-auto rounded-md border border-meta-border">
                {directory.map((user) => (
                  <label
                    key={user.id}
                    className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-meta-card/60"
                  >
                    <input
                      type="radio"
                      className="accent-blue-500"
                      name="coach-composer-dm"
                      checked={dmRecipientId === user.id}
                      onChange={() => setDmRecipient(user.id)}
                    />
                    <span className="flex-1">
                      <span className="block font-medium text-meta-light">{user.displayName}</span>
                      {user.email ? (
                        <span className="block text-xs text-meta-muted">{user.email}</span>
                      ) : null}
                    </span>
                  </label>
                ))}
                {directory.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-meta-muted">No recipients available.</div>
                ) : null}
              </div>
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
              <div className="mb-2 text-xs uppercase text-meta-muted">Recipients</div>
              <div className="max-h-60 overflow-y-auto rounded-md border border-meta-border">
                {directory.map((user) => (
                  <label
                    key={user.id}
                    className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-meta-card/60"
                  >
                    <Checkbox
                      checked={!!groupRecipients[user.id]}
                      onCheckedChange={(checked) => toggleGroupRecipient(user.id, !!checked)}
                    />
                    <span className="flex-1">
                      <span className="block font-medium text-meta-light">{user.displayName}</span>
                      {user.email ? (
                        <span className="block text-xs text-meta-muted">{user.email}</span>
                      ) : null}
                    </span>
                  </label>
                ))}
                {directory.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-meta-muted">No recipients available.</div>
                ) : null}
              </div>
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

          <div className="rounded-md border border-meta-border bg-meta-dark/60 p-1">
            <MarkdownEditor
              value={body}
              onChange={setBody}
              preview={preview}
              height={240}
            />
          </div>

          {error ? (
            <div className="rounded-md border border-red-500/60 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
              <button className="ml-3 underline" onClick={resetError}>Dismiss</button>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close} disabled={loading}>
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
              {loading ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
