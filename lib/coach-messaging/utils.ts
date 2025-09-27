import type { CoachMessage, ThreadGroup } from './types'

const PALETTE = [
  'bg-sky-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-orange-500',
  'bg-rose-500',
  'bg-amber-500',
  'bg-teal-500',
] as const

export function avatarColorForId(id: string | undefined | null): string {
  if (!id) return PALETTE[0]
  let hash = 0
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  }
  return PALETTE[hash % PALETTE.length]
}

export function initialsForName(name: string | undefined | null): string {
  const trimmed = (name || '').trim()
  if (!trimmed) return '?'
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  const first = parts[0]?.[0] ?? ''
  const last = parts[parts.length - 1]?.[0] ?? ''
  const combined = `${first}${last}`.trim()
  return combined ? combined.toUpperCase() : parts[0]!.slice(0, 2).toUpperCase()
}

export function plainTextSnippet(body: string, limit = 120): string {
  const cleaned = (body || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.+?)\]\((.*?)\)/g, '$1')
    .replace(/[*>_#~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return ''
  if (cleaned.length <= limit) return cleaned
  return `${cleaned.slice(0, limit - 3)}...`
}

export function deriveThreadGroups(messages: CoachMessage[]): ThreadGroup[] {
  const map = new Map<string, CoachMessage[]>()
  const sorted = [...messages].sort((a, b) => {
    const ta = new Date(a.created_at).getTime()
    const tb = new Date(b.created_at).getTime()
    return ta - tb
  })
  for (const message of sorted) {
    const rootId = message.parent_message_id ?? message.id
    const list = map.get(rootId)
    if (list) {
      list.push(message)
    } else {
      map.set(rootId, [message])
  }
  }
  const groups: ThreadGroup[] = []
  for (const [rootId, groupMessages] of map.entries()) {
    const last = groupMessages[groupMessages.length - 1]
    const root = groupMessages.find((m) => m.id === rootId) ?? groupMessages[0]
    const subject = plainTextSnippet(root.body)
    groups.push({
      rootId,
      subject: subject || null,
      messages: groupMessages,
      lastActivityAt: last.created_at,
    })
  }
  groups.sort((a, b) => {
    const ta = new Date(a.lastActivityAt).getTime()
    const tb = new Date(b.lastActivityAt).getTime()
    return tb - ta
  })
  return groups
}
