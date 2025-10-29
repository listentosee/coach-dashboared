import { useCallback, useMemo, useState } from 'react'
import type { CoachInboxSelection } from '@/components/coach-messaging/inbox-pane'

export type ComposerMode = 'dm' | 'group' | 'announcement' | 'reply' | 'forward'

export type ComposerPayload = {
  mode: ComposerMode
  body: string
  subject?: string | null
  dmRecipientId?: string | null
  groupRecipientIds?: string[]
  context?: CoachInboxSelection | null
}

export type UseCoachComposerOptions = {
  currentUserId: string
  onSend: (payload: ComposerPayload) => Promise<void>
}

export type CoachComposerController = {
  open: boolean
  mode: ComposerMode
  loading: boolean
  error: string | null
  body: string
  subject: string
  preview: boolean
  dmRecipientId: string | null
  lockDmRecipient: boolean
  groupRecipients: Record<string, boolean>
  context: CoachInboxSelection | null
  attachments: { name: string; url: string; markdown: string }[]
  openDm: (options?: { recipientId?: string; subject?: string | null; lockRecipient?: boolean }) => void
  openGroup: () => void
  openAnnouncement: () => void
  openReply: (selection: CoachInboxSelection) => void
  openForward: (selection: CoachInboxSelection) => void
  close: () => void
  setBody: (next: string) => void
  setSubject: (next: string) => void
  togglePreview: () => void
  setDmRecipient: (id: string) => void
  toggleGroupRecipient: (id: string, present: boolean) => void
  resetRecipients: () => void
  handleFiles: (files: FileList | null) => Promise<void>
  send: () => Promise<void>
  resetError: () => void
}

export function useCoachComposer({ currentUserId, onSend }: UseCoachComposerOptions): CoachComposerController {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<ComposerMode>('dm')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [subject, setSubject] = useState('')
  const [preview, setPreview] = useState(false)
  const [dmRecipientId, setDmRecipientId] = useState<string | null>(null)
  const [lockDmRecipient, setLockDmRecipient] = useState(false)
  const [groupRecipients, setGroupRecipients] = useState<Record<string, boolean>>({})
  const [context, setContext] = useState<CoachInboxSelection | null>(null)
  const [attachments, setAttachments] = useState<{ name: string; url: string; markdown: string }[]>([])

  const resetRecipients = useCallback(() => {
    setDmRecipientId(null)
    setGroupRecipients({})
    setLockDmRecipient(false)
  }, [])

  const openDm = useCallback((options?: { recipientId?: string; subject?: string | null; lockRecipient?: boolean }) => {
    setMode('dm')
    setContext(null)
    setBody('')
    setPreview(false)
    setAttachments([])
    setGroupRecipients({})
    setLockDmRecipient(!!options?.lockRecipient)
    setDmRecipientId(options?.recipientId ?? null)
    setSubject(options?.subject ?? '')
    setOpen(true)
  }, [])

  const openGroup = useCallback(() => {
    setMode('group')
    setContext(null)
    setBody('')
    setSubject('')
    resetRecipients()
    setPreview(false)
    setAttachments([])
    setOpen(true)
  }, [resetRecipients])

  const openAnnouncement = useCallback(() => {
    setMode('announcement')
    setContext(null)
    setBody('')
    setSubject('')
    // For announcements, auto-select all users (don't reset recipients)
    setPreview(false)
    setAttachments([])
    setOpen(true)
  }, [])

  const openReply = useCallback((selection: CoachInboxSelection) => {
    setMode('reply')
    setContext(selection)
    setBody('')
    setSubject('')
    resetRecipients()
    setPreview(false)
    setAttachments([])
    setOpen(true)
  }, [resetRecipients])

  const openForward = useCallback((selection: CoachInboxSelection) => {
    const forwardedBody = `\n\n--- Forwarded message ---\nFrom: ${selection.message.sender_name || selection.message.sender_email || 'Unknown sender'}\nSent: ${new Date(selection.message.created_at).toLocaleString()}\n\n${selection.message.body}`
    setMode('forward')
    setContext(selection)
    setBody(forwardedBody)
    setSubject(selection.threadSubject ? `Fwd: ${selection.threadSubject}` : 'Forwarded message')
    resetRecipients()
    setPreview(false)
    setAttachments([])
    setOpen(true)
  }, [resetRecipients])

  const close = useCallback(() => {
    setOpen(false)
    setLoading(false)
    setError(null)
    setBody('')
    setSubject('')
    setPreview(false)
    setContext(null)
    setAttachments([])
    resetRecipients()
  }, [resetRecipients])

  const togglePreview = useCallback(() => {
    setPreview((prev) => !prev)
  }, [])

  const setDmRecipient = useCallback((id: string) => {
    setDmRecipientId(id)
  }, [])

  const toggleGroupRecipient = useCallback((id: string, present: boolean) => {
    setGroupRecipients((prev) => ({ ...prev, [id]: present }))
  }, [])

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    for (const file of Array.from(files)) {
      try {
        const form = new FormData()
        form.append('file', file)
        const res = await fetch('/api/messaging/upload', { method: 'POST', body: form })
        if (!res.ok) continue
        const json = await res.json()
        const path = json.path as string
        const ct = (json.contentType as string) || file.type
        const name = json.name || file.name
        const signedRoute = `/api/messaging/file?path=${encodeURIComponent(path)}`
        const markdown = ct?.startsWith('image/') ? `\n![${name}](${signedRoute})\n` : `\n[${name}](${signedRoute})\n`
        setAttachments((prev) => [...prev, { name, url: signedRoute, markdown }])
        setBody((prev) => prev + markdown)
      } catch (err) {
        console.error('Composer upload failed', err)
      }
    }
  }, [])

  const send = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload: ComposerPayload = {
        mode,
        body,
        subject: subject || null,
        dmRecipientId: dmRecipientId,
        groupRecipientIds: Object.entries(groupRecipients)
          .filter(([, checked]) => checked)
          .map(([id]) => id),
        context,
      }
      await onSend(payload)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Failed to send message')
      return
    } finally {
      setLoading(false)
    }
    close()
  }, [body, close, dmRecipientId, groupRecipients, mode, onSend, context, subject])

  const resetError = useCallback(() => setError(null), [])

  return useMemo(() => ({
    open,
    mode,
    loading,
    error,
    body,
    subject,
    preview,
    dmRecipientId,
    lockDmRecipient,
    groupRecipients,
    context,
    attachments,
    openDm,
    openGroup,
    openAnnouncement,
    openReply,
    openForward,
    close,
    setBody,
    setSubject,
    togglePreview,
    setDmRecipient,
    toggleGroupRecipient,
    resetRecipients,
    handleFiles,
    send,
    resetError,
  }), [
    open,
    mode,
    loading,
    error,
    body,
    subject,
    preview,
    dmRecipientId,
    groupRecipients,
    context,
    attachments,
    openDm,
    openGroup,
    openAnnouncement,
    openReply,
    openForward,
    close,
    togglePreview,
    setDmRecipient,
    toggleGroupRecipient,
    resetRecipients,
    handleFiles,
    send,
    resetError,
  ])
}
