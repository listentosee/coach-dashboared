// Shared helpers for normalizing free-text import values to canonical enums.

export function normalizeEnumValue(input?: string | null): string {
  const raw = (input ?? '').trim().toLowerCase()
  if (!raw) return ''
  const squashed = raw.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (squashed === 'middle school') return 'middle_school'
  if (squashed === 'high school') return 'high_school'
  if (squashed === 'adult ed' || squashed === 'adult education' || squashed === 'continuing ed') return 'adult_ed'
  if (squashed === 'traditional college' || squashed === 'traditional') return 'traditional'
  if (squashed === 'chrome book' || squashed === 'chromebook') return 'chrome_book'
  return squashed.replace(/\s+/g, '_')
}

export function normalizeGrade(input?: string | null): string {
  const raw = (input ?? '').trim().toLowerCase()
  if (!raw) return ''
  return raw
}

export function normalizeProgramTrack(input?: string | null): string {
  const raw = (input ?? '').trim().toLowerCase()
  if (!raw) return ''
  if (['adult', 'adult ed', 'continuing ed', 'continuing education', 'adult education'].includes(raw)) {
    return 'adult_ed'
  }
  if (['adult_ed', 'continuing_ed'].includes(raw.replace(/\s+/g, '_'))) {
    return 'adult_ed'
  }
  if (['traditional', 'traditional student', 'traditional college'].includes(raw)) {
    return 'traditional'
  }
  return normalizeEnumValue(raw)
}
