// Shared helpers for normalizing free-text import values to canonical enums.

export function normalizeEnumValue(input?: string | null): string {
  const raw = (input ?? '').trim().toLowerCase()
  if (!raw) return ''
  const squashed = raw.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (squashed === 'middle school') return 'middle_school'
  if (squashed === 'high school') return 'high_school'
  if (squashed === 'chrome book' || squashed === 'chromebook') return 'chrome_book'
  return squashed.replace(/\s+/g, '_')
}

export function normalizeGrade(input?: string | null): string {
  const raw = (input ?? '').trim().toLowerCase()
  if (!raw) return ''
  return raw
}
