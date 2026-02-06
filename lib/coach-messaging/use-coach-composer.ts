import { useCallback, useMemo, useState } from 'react'
import type { CoachInboxSelection } from '@/components/coach-messaging/inbox-pane'
import { generateDraftId, removeDraft, upsertDraft, type CoachMessageDraft } from '@/lib/coach-messaging/drafts'

export type ComposerMode = 'dm' | 'group' | 'announcement' | 'reply' | 'forward'

export type ComposerPayload = {
  mode: ComposerMode
  body: string
  subject?: string | null
  highPriority?: boolean
  dmRecipientId?: string | null
  groupRecipientIds?: string[]
  context?: CoachInboxSelection | null
}

export type UseCoachComposerOptions = {
  currentUserId: string
  onSend: (payload: ComposerPayload) => Promise<void>
  drafts?: CoachMessageDraft[]
}

export type CoachComposerController = {
  open: boolean
  mode: ComposerMode
  loading: boolean
  error: string | null
  sendState: 'idle' | 'success'
  body: string
  subject: string
  preview: boolean
  highPriority: boolean
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
  setHighPriority: (next: boolean) => void
  togglePreview: () => void
  setDmRecipient: (id: string) => void
  toggleGroupRecipient: (id: string, present: boolean) => void
  resetRecipients: () => void
  handleFiles: (files: FileList | null) => Promise<void>
  send: () => Promise<void>
  saveDraft: () => Promise<boolean>
  discardDraft: () => Promise<boolean>
  openDraft: (draft: CoachMessageDraft, selection?: CoachInboxSelection | null) => void
  resetError: () => void
}

export function useCoachComposer({ currentUserId: _currentUserId, onSend, drafts = [] }: UseCoachComposerOptions): CoachComposerController {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<ComposerMode>('dm')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sendState, setSendState] = useState<'idle' | 'success'>('idle')
  const [body, setBody] = useState('')
  const [subject, setSubject] = useState('')
  const [preview, setPreview] = useState(false)
  const [highPriority, setHighPriority] = useState(false)
  const [dmRecipientId, setDmRecipientId] = useState<string | null>(null)
  const [lockDmRecipient, setLockDmRecipient] = useState(false)
  const [groupRecipients, setGroupRecipients] = useState<Record<string, boolean>>({})
  const [context, setContext] = useState<CoachInboxSelection | null>(null)
  const [attachments, setAttachments] = useState<{ name: string; url: string; markdown: string }[]>([])
  const [draftId, setDraftId] = useState<string | null>(null)

  const applyDraft = useCallback((draft: CoachMessageDraft, selection?: CoachInboxSelection | null) => {
    setDraftId(draft.id)
    setMode(draft.mode)
    setBody(draft.body || '')
    setSubject(draft.subject || '')
    setHighPriority(draft.highPriority ?? false)
    setDmRecipientId(draft.dmRecipientId ?? null)
    setLockDmRecipient(!!draft.dmRecipientId)
    setGroupRecipients(
      (draft.groupRecipientIds || []).reduce<Record<string, boolean>>((acc, id) => {
        acc[id] = true
        return acc
      }, {})
    )
    setContext(selection ?? null)
    setPreview(false)
    setAttachments([])
    setSendState('idle')
  }, [])

  const findDraft = useCallback((predicate: (draft: CoachMessageDraft) => boolean) => {
    const matches = drafts.filter(predicate)
    if (matches.length === 0) return null
    return matches.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  }, [drafts])

  const saveDraft = useCallback(async () => {
    const draft: CoachMessageDraft = {
      id: draftId ?? generateDraftId(),
      mode,
      body,
      subject,
      highPriority,
      dmRecipientId,
      groupRecipientIds: Object.entries(groupRecipients)
        .filter(([, checked]) => checked)
        .map(([id]) => id),
      conversationId: context?.conversation?.id ?? null,
      threadId: context?.threadId ?? null,
      updatedAt: new Date().toISOString(),
    }
    try {
      const saved = await upsertDraft(draft)
      if (!saved) {
        setError('Failed to save draft')
        return false
      }
      setDraftId(saved.id ?? draft.id)
      return true
    } catch (err) {
      console.error('Failed to save draft', err)
      setError('Failed to save draft')
      return false
    }
  }, [body, dmRecipientId, draftId, groupRecipients, mode, subject, context])

  const discardDraft = useCallback(async () => {
    if (!draftId) return true
    try {
      const removed = await removeDraft(draftId)
      if (!removed) {
        setError('Failed to discard draft')
        return false
      }
      setDraftId(null)
      return true
    } catch (err) {
      console.error('Failed to discard draft', err)
      setError('Failed to discard draft')
      return false
    }
  }, [draftId])

  const resetRecipients = useCallback(() => {
    setDmRecipientId(null)
    setGroupRecipients({})
    setLockDmRecipient(false)
  }, [])

  const openDm = useCallback((options?: { recipientId?: string; subject?: string | null; lockRecipient?: boolean }) => {
    setContext(null)
    setMode('dm')
    setBody('')
    setPreview(false)
    setHighPriority(false)
    setAttachments([])
    setGroupRecipients({})
    setLockDmRecipient(!!options?.lockRecipient)
    setDmRecipientId(options?.recipientId ?? null)
    setSubject(options?.subject ?? '')
    setSendState('idle')
    setDraftId(null)
    setOpen(true)
  }, [])

  const openGroup = useCallback(() => {
    setContext(null)
    setMode('group')
    setBody('')
    setSubject('')
    setHighPriority(false)
    resetRecipients()
    setPreview(false)
    setAttachments([])
    setSendState('idle')
    setDraftId(null)
    setOpen(true)
  }, [resetRecipients])

  const openAnnouncement = useCallback(() => {
    setContext(null)
    setMode('announcement')
    setBody('')
    setSubject('')
    setHighPriority(false)
    // For announcements, auto-select all users (don't reset recipients)
    setPreview(false)
    setAttachments([])
    setSendState('idle')
    setDraftId(null)
    setOpen(true)
  }, [])

  const openReply = useCallback((selection: CoachInboxSelection) => {
    const draft = findDraft((item) => item.mode === 'reply' && item.threadId === selection.threadId)
    setContext(selection)
    if (draft && draft.threadId === selection.threadId) {
      applyDraft(draft, selection)
    } else {
      setMode('reply')
      setBody('')
      setSubject('')
      setHighPriority(false)
      resetRecipients()
      setPreview(false)
      setAttachments([])
      setSendState('idle')
      setDraftId(null)
    }
    setOpen(true)
  }, [applyDraft, findDraft, resetRecipients])

  const openForward = useCallback((selection: CoachInboxSelection) => {
    const forwardedBody = `\n\n--- Forwarded message ---\nFrom: ${selection.message.sender_name || selection.message.sender_email || 'Unknown sender'}\nSent: ${new Date(selection.message.created_at).toLocaleString()}\n\n${selection.message.body}`
    const draft = findDraft((item) => item.mode === 'forward' && item.threadId === selection.threadId)
    setContext(selection)
    if (draft && draft.threadId === selection.threadId) {
      applyDraft(draft, selection)
    } else {
      setMode('forward')
      setBody(forwardedBody)
      setSubject(selection.threadSubject ? `Fwd: ${selection.threadSubject}` : 'Forwarded message')
      setHighPriority(false)
      resetRecipients()
      setPreview(false)
      setAttachments([])
      setSendState('idle')
      setDraftId(null)
    }
    setOpen(true)
  }, [applyDraft, findDraft, resetRecipients])

  const close = useCallback(() => {
    setOpen(false)
    setLoading(false)
    setError(null)
    setBody('')
    setSubject('')
    setPreview(false)
    setHighPriority(false)
    setContext(null)
    setAttachments([])
    resetRecipients()
    setSendState('idle')
    setDraftId(null)
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
        highPriority: highPriority || false,
        dmRecipientId: dmRecipientId,
        groupRecipientIds: Object.entries(groupRecipients)
          .filter(([, checked]) => checked)
          .map(([id]) => id),
        context,
      }
      await onSend(payload)
      setSendState('success')
      await discardDraft()
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Failed to send message')
      return
    } finally {
      setLoading(false)
    }
  }, [body, dmRecipientId, groupRecipients, mode, onSend, context, subject, highPriority, discardDraft])

  const resetError = useCallback(() => setError(null), [])

  const openDraft = useCallback((draft: CoachMessageDraft, selection?: CoachInboxSelection | null) => {
    applyDraft(draft, selection ?? null)
    setOpen(true)
  }, [applyDraft])

  return useMemo(() => ({
    open,
    mode,
    loading,
    error,
    sendState,
    body,
    subject,
    preview,
    highPriority,
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
    setHighPriority,
    togglePreview,
    setDmRecipient,
    toggleGroupRecipient,
    resetRecipients,
    handleFiles,
    send,
    saveDraft,
    discardDraft,
    openDraft,
    resetError,
  }), [
    open,
    mode,
    loading,
    error,
    sendState,
    body,
    subject,
    preview,
    highPriority,
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
    setHighPriority,
    togglePreview,
    setDmRecipient,
    toggleGroupRecipient,
    resetRecipients,
    handleFiles,
    send,
    saveDraft,
    discardDraft,
    openDraft,
    resetError,
  ])
}
