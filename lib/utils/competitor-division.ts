export type CompetitorDivision = 'middle_school' | 'high_school' | 'college'

export function deriveDivisionFromGrade(grade?: string | null, isAdult?: boolean): CompetitorDivision | null {
  if (isAdult) return 'college'
  if (!grade) return null
  const normalized = String(grade).trim().toLowerCase()
  if (!normalized) return null
  if (normalized === 'college') return 'college'
  const parsed = Number.parseInt(normalized, 10)
  if (Number.isNaN(parsed)) return null
  if (parsed >= 6 && parsed <= 8) return 'middle_school'
  if (parsed >= 9 && parsed <= 12) return 'high_school'
  return null
}
