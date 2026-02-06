export type CoachMessageDraft = {
  id: string
  mode: 'dm' | 'group' | 'announcement' | 'reply' | 'forward'
  body: string
  subject: string
  highPriority: boolean
  dmRecipientId: string | null
  groupRecipientIds: string[]
  conversationId: string | null
  threadId: string | null
  updatedAt: string
}

export function generateDraftId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `draft_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

function notifyDraftsUpdated() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event('coach-drafts-updated'))
}

export async function listDrafts(): Promise<CoachMessageDraft[]> {
  const res = await fetch('/api/messaging/drafts', { method: 'GET' })
  if (!res.ok) return []
  const json = await res.json()
  return (json.drafts as CoachMessageDraft[]) || []
}

export async function upsertDraft(draft: CoachMessageDraft): Promise<CoachMessageDraft | null> {
  const res = await fetch('/api/messaging/drafts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  })
  if (!res.ok) return null
  const json = await res.json()
  notifyDraftsUpdated()
  return (json.draft as CoachMessageDraft) || null
}

export async function removeDraft(draftId: string): Promise<boolean> {
  const res = await fetch(`/api/messaging/drafts/${draftId}`, { method: 'DELETE' })
  if (!res.ok) return false
  notifyDraftsUpdated()
  return true
}
