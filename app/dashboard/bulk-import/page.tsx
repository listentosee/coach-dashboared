'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import ActingAsBanner from '@/components/admin/ActingAsBanner'
import { ALLOWED_DIVISIONS, ALLOWED_ETHNICITIES, ALLOWED_GENDERS, ALLOWED_GRADES, ALLOWED_LEVELS_OF_TECHNOLOGY, ALLOWED_RACES, ALLOWED_PROGRAM_TRACKS } from '@/lib/constants/enums'
import { normalizeEnumValue, normalizeGrade, normalizeProgramTrack } from '@/lib/utils/import-normalize'
import { supabase } from '@/lib/supabase/client'
import { useAdminCoachContext } from '@/lib/admin/useAdminCoachContext'

type FieldKey =
  | 'first_name'
  | 'last_name'
  | 'is_18_or_over'
  | 'grade'
  | 'email_school'
  | 'email_personal'
  | 'parent_name'
  | 'parent_email'
  | 'division'
  | 'gender'
  | 'race'
  | 'ethnicity'
  | 'level_of_technology'
  | 'years_competing'
  | 'program_track'

type FieldConfig = {
  key: FieldKey
  label: string
  required?: boolean
  hint?: string
}

const FIELDS: FieldConfig[] = [
  { key: 'first_name', label: 'First Name', required: true, hint: 'At least two characters; letters, spaces, hyphens, apostrophes, and periods allowed.' },
  { key: 'last_name', label: 'Last Name', required: true, hint: 'At least two characters; letters, spaces, hyphens, apostrophes, and periods allowed.' },
  { key: 'is_18_or_over', label: 'Is Adult', required: true, hint: 'Accepts Y/N, Yes/No, True/False, or 1/0.' },
  { key: 'grade', label: 'Grade', required: true, hint: 'Use 6–12 for middle/high school. College division auto-sets to "college".' },
  { key: 'email_school', label: 'School Email', required: true, hint: 'Must be a valid email for the competitor.' },
  { key: 'email_personal', label: 'Personal Email', hint: 'Optional; must be a valid email if provided.' },
  { key: 'parent_name', label: 'Parent Name', hint: 'Optional; provide for minors when available.' },
  { key: 'parent_email', label: 'Parent Email', hint: 'Required if parent name provided; must be a valid email.' },
  { key: 'division', label: 'Division', hint: 'Allowed: middle_school | high_school | college' },
  { key: 'program_track', label: 'Program Track', hint: 'College only. Allowed: traditional | adult_ed. Blank defaults to traditional.' },
  { key: 'gender', label: 'Gender', hint: 'Allowed: male | female | other | prefer_not_to_say' },
  { key: 'race', label: 'Race', hint: 'Allowed: white | black | hispanic | asian | native | pacific | other | declined_to_answer' },
  { key: 'ethnicity', label: 'Ethnicity', hint: 'Allowed: not_hispanic | hispanic | declined_to_answer' },
  { key: 'level_of_technology', label: 'Level of Technology', hint: 'Allowed: pc | mac | chrome_book | linux | other' },
  { key: 'years_competing', label: 'Years Competing', hint: 'Whole number 0–20 representing prior experience.' },
]

const FIELD_LOOKUP = FIELDS.reduce((acc, field) => {
  acc[field.key] = field
  return acc
}, {} as Record<FieldKey, FieldConfig>)

const COLUMN_ORDER: FieldKey[] = [
  'first_name',
  'last_name',
  'is_18_or_over',
  'grade',
  'email_school',
  'email_personal',
  'parent_name',
  'parent_email',
  'division',
  'program_track',
  'gender',
  'race',
  'ethnicity',
  'level_of_technology',
  'years_competing',
]

type Row = Record<FieldKey, string>
type ParsedRow = string[]

const serializeRowForApi = (row: Row) => ({
  ...row,
  grade: normalizeGrade(row.grade),
  division: normalizeEnumValue(row.division),
  gender: normalizeEnumValue(row.gender),
  race: normalizeEnumValue(row.race),
  ethnicity: normalizeEnumValue(row.ethnicity),
  level_of_technology: normalizeEnumValue(row.level_of_technology),
  program_track: normalizeProgramTrack(row.program_track),
})

function parseBoolean(input: string): boolean | null {
  const v = (input || '').trim().toLowerCase()
  if (!v) return null
  if (['y', 'yes', 'true', '1'].includes(v)) return true
  if (['n', 'no', 'false', '0'].includes(v)) return false
  return null
}

function isValidEmail(email?: string | null) {
  if (!email) return false
  const e = email.trim().toLowerCase()
  return /.+@.+\..+/.test(e)
}

function isValidName(name?: string | null) {
  if (!name) return false
  const n = name.trim()
  // Must be at least 2 characters and contain only letters, spaces, hyphens, apostrophes, and periods
  return n.length >= 2 && /^[a-zA-Z\s\-'.]+$/.test(n)
}

// Minimal CSV parser with basic quote handling
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let cur: string[] = []
  let buf = ''
  let inQuotes = false

  const pushCell = () => {
    cur.push(buf)
    buf = ''
  }
  const pushRow = () => {
    rows.push(cur)
    cur = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { buf += '"'; i++ } else { inQuotes = false }
      } else { buf += ch }
    } else {
      if (ch === '"') { inQuotes = true }
      else if (ch === ',') { pushCell() }
      else if (ch === '\n') { pushCell(); pushRow() }
      else if (ch === '\r') { /* ignore CR; handled by LF */ }
      else { buf += ch }
    }
  }
  pushCell(); if (cur.length) pushRow()
  return rows
}

function isDocumentationRow(row: string[] | undefined): boolean {
  if (!row || row.length === 0) return false
  let informative = 0
  let nonEmpty = 0
  for (const cell of row) {
    if (!cell) continue
    nonEmpty++
    const lower = cell.toLowerCase()
    if (lower.includes('allowed:') || lower.includes('[required')) {
      informative++
    }
  }
  if (nonEmpty === 0) return false
  return informative >= Math.max(2, Math.ceil(nonEmpty * 0.4))
}

export default function BulkImportPage() {
  const { coachId, loading: ctxLoading } = useAdminCoachContext()
  const [isAdmin, setIsAdmin] = useState(false)
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [raw, setRaw] = useState<string>('')
  const [fileName, setFileName] = useState<string>('')
  const [rows, setRows] = useState<string[][]>([])
  const [headerIndex, setHeaderIndex] = useState<number>(0)
  const [mapping, setMapping] = useState<Record<FieldKey, number | null>>({
    first_name: null,
    last_name: null,
    is_18_or_over: null,
    grade: null,
    email_school: null,
    email_personal: null,
    parent_name: null,
    parent_email: null,
    division: null,
    gender: null,
    race: null,
    ethnicity: null,
    level_of_technology: null,
    years_competing: null,
    program_track: null,
  })
  const [edited, setEdited] = useState<Row[]>([])
  const [errors, setErrors] = useState<Record<number, string[]>>({})
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState<{ total: number; created: number; updated: number; duplicates: number; failed: number }>({ total: 0, created: 0, updated: 0, duplicates: 0, failed: 0 })
  const [duplicateConflicts, setDuplicateConflicts] = useState<Record<number, { email_school?: string[]; email_personal?: string[] }>>({})
  const [duplicateCheckLoading, setDuplicateCheckLoading] = useState(false)
  const [duplicateCheckError, setDuplicateCheckError] = useState<string | null>(null)

  const disableAdminAll = !ctxLoading && coachId === null // Admin All-coaches → read-only

  const headers = useMemo(() => (rows[headerIndex] || []).map(h => (h || '').trim()), [rows, headerIndex])
  const dataRows = useMemo(() => rows.slice(headerIndex + 1), [rows, headerIndex])

  // Suggest mapping based on header names
  useEffect(() => {
    if (!headers.length) return
    const suggest = { ...mapping }
    const lc = headers.map(h => h.toLowerCase())
    const tryMap = (key: FieldKey, hints: string[]) => {
      if (suggest[key] !== null) return
      for (const h of hints) {
        const idx = lc.findIndex(x => x === h || x.includes(h))
        if (idx >= 0) { suggest[key] = idx; break }
      }
    }
    tryMap('first_name', ['first name', 'first', 'fname'])
    tryMap('last_name', ['last name', 'last', 'lname'])
    tryMap('is_18_or_over', ['adult', 'is adult', 'is_18', '18', 'is 18 or over'])
    tryMap('grade', ['grade', 'class', 'year'])
    tryMap('email_school', ['school email', 'email_school', 'school'])
    tryMap('email_personal', ['personal email', 'email', 'email_personal'])
    tryMap('parent_name', ['parent name', 'guardian name', 'parent'])
    tryMap('parent_email', ['parent email', 'guardian email'])
    tryMap('division', ['division'])
    tryMap('program_track', ['track', 'program track', 'college track', 'program'])
    tryMap('gender', ['gender'])
    tryMap('race', ['race'])
    tryMap('ethnicity', ['ethnicity'])
    tryMap('level_of_technology', ['level of technology','technology level','tech level'])
    tryMap('years_competing', ['years competing','yrs competing','years'])
    setMapping(suggest)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headers.join('|')])

  const mapped: Row[] = useMemo(() => {
    return dataRows.map((r) => {
      const obj = {} as Row
      for (const f of FIELDS) {
        const idx = mapping[f.key]
        obj[f.key] = idx != null && idx >= 0 ? (r[idx] || '').trim() : ''
      }
      return obj
    })
  }, [dataRows, mapping])

  // Merge edits
  const currentRows: Row[] = useMemo(() => {
    return mapped.map((m, i) => ({ ...m, ...(edited[i] || {}) }))
  }, [mapped, edited])

  const duplicateCheckKey = useMemo(() => {
    return currentRows
      .map(row => `${(row.email_school || '').trim().toLowerCase()}|${(row.email_personal || '').trim().toLowerCase()}`)
      .join('||')
  }, [currentRows])

  const duplicateRowCount = useMemo(() => Object.keys(duplicateConflicts).length, [duplicateConflicts])

  // Determine if current user is admin. Bulk Import is coach-only per policy.
  useEffect(() => {
    const loadRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setIsAdmin(false); return }
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        setIsAdmin((profile as any)?.role === 'admin')
      } catch { setIsAdmin(false) }
    }
    loadRole()
  }, [])

  // Enumerations (imported canonical lists)
  const allowedDivisions = ALLOWED_DIVISIONS as readonly string[]
  const allowedGenders = ALLOWED_GENDERS as readonly string[]
  const allowedRaces = ALLOWED_RACES as readonly string[]
  const allowedEthnicities = ALLOWED_ETHNICITIES as readonly string[]
  const allowedLevels = ALLOWED_LEVELS_OF_TECHNOLOGY as readonly string[]
  const allowedGrades = ALLOWED_GRADES as readonly string[]
  const allowedProgramTracks = ALLOWED_PROGRAM_TRACKS as readonly string[]
  const [invalid, setInvalid] = useState<Record<number, Partial<Record<FieldKey, boolean>>>>({})

  const fieldGuide = useMemo(() => ({
    first_name: {
      description: 'Required. At least two characters; letters, spaces, hyphens, apostrophes, and periods are allowed.',
    },
    last_name: {
      description: 'Required. At least two characters; letters, spaces, hyphens, apostrophes, and periods are allowed.',
    },
    is_18_or_over: {
      description: 'Required. Accepts Y/N, Yes/No, True/False, or 1/0. Determines whether parent information is needed.',
    },
    grade: {
      description: 'Required. Use numeric grades 6–12 for middle/high school. When Division is college, the importer will automatically assign grade "college".',
    },
    email_school: {
      description: 'Required. Must be a valid email address for the competitor (students 18+ use school email; minors use this for communications).',
    },
    email_personal: {
      description: 'Optional. Must be a valid email if provided (often used for secondary contact).',
    },
    parent_name: {
      description: 'Optional. Provide when the competitor is a minor (under 18). If set, must be at least two characters.',
    },
    parent_email: {
      description: 'Optional. Required when a parent name is provided; must be a valid email address.',
    },
    division: {
      description: 'Optional but recommended. Controls roster grouping and available program tracks. Leave blank to assign later in the UI.',
    },
    program_track: {
      description: 'Optional. Only used when Division is college. Use "traditional" for current college students or "adult_ed" for Adult Ed/Continuing Ed learners. Leave blank to default to traditional.',
    },
    gender: {
      description: 'Optional. Use the canonical gender tokens so analytics remain consistent.',
    },
    race: {
      description: 'Optional. Use the canonical race tokens so analytics remain consistent.',
    },
    ethnicity: {
      description: 'Optional. Use the canonical ethnicity tokens so analytics remain consistent.',
    },
    level_of_technology: {
      description: 'Optional. Indicates the primary device the competitor uses (PC, MAC, chromebook, etc.).',
    },
    years_competing: {
      description: 'Optional. Whole number from 0–20 representing prior competition experience.',
    },
  } as Record<FieldKey, { description: string }>), [])

  const allowedValueLookup = useMemo(() => ({
    division: allowedDivisions,
    program_track: allowedProgramTracks,
    gender: allowedGenders,
    race: allowedRaces,
    ethnicity: allowedEthnicities,
    level_of_technology: allowedLevels,
    grade: allowedGrades,
    first_name: null,
    last_name: null,
    is_18_or_over: null,
    email_school: null,
    email_personal: null,
    parent_name: null,
    parent_email: null,
    years_competing: null,
  } as Record<FieldKey, readonly string[] | null>), [
    allowedDivisions,
    allowedProgramTracks,
    allowedGenders,
    allowedRaces,
    allowedEthnicities,
    allowedLevels,
    allowedGrades,
  ])

  // Validate (with normalization for multi-word enums)
  useEffect(() => {
    const err: Record<number, string[]> = {}
    const invalidMap: Record<number, Partial<Record<FieldKey, boolean>>> = {}
    const mark = (i: number, k: FieldKey) => { (invalidMap[i] ||= {} as any)[k] = true }
    currentRows.forEach((row, i) => {
      const rowErr: string[] = []
      if (!row.first_name) { rowErr.push('First name required'); mark(i, 'first_name') }
      else if (!isValidName(row.first_name)) { rowErr.push('First name must be at least 2 letters and contain only letters, spaces, hyphens, apostrophes, or periods'); mark(i, 'first_name') }
      if (!row.last_name) { rowErr.push('Last name required'); mark(i, 'last_name') }
      else if (!isValidName(row.last_name)) { rowErr.push('Last name must be at least 2 letters and contain only letters, spaces, hyphens, apostrophes, or periods'); mark(i, 'last_name') }
      const isAdult = parseBoolean(row.is_18_or_over)
      if (isAdult === null) { rowErr.push('Is Adult must be Y/N or True/False'); mark(i, 'is_18_or_over') }
      if (!row.grade) { rowErr.push('Grade required'); mark(i, 'grade') }
      const gradeToken = normalizeGrade(row.grade)
      if (row.grade && !allowedGrades.includes(gradeToken as any)) { rowErr.push('Invalid grade'); mark(i, 'grade') }
      // School email is required for all participants
      if (!isValidEmail(row.email_school)) { rowErr.push('School email is required and must be valid'); mark(i, 'email_school') }
      // Personal email is optional, but if provided must be valid
      if (row.email_personal && !isValidEmail(row.email_personal)) { rowErr.push('Personal email is invalid'); mark(i, 'email_personal') }
      if (isAdult === false) {
        // Validate parent name if provided
        if (row.parent_name && !isValidName(row.parent_name)) { rowErr.push('Parent name must be at least 2 letters and contain only letters, spaces, hyphens, apostrophes, or periods'); mark(i, 'parent_name') }
        // Validate parent email when parent name is provided (required if name present)
        if (row.parent_name && !isValidEmail(row.parent_email)) { rowErr.push('Parent email is required and must be valid when parent name is provided'); mark(i, 'parent_email') }
        // If no parent name, allow parent email to be empty; if present, must be valid
        if (!row.parent_name && row.parent_email && !isValidEmail(row.parent_email)) { rowErr.push('Parent email is invalid'); mark(i, 'parent_email') }
      }
      // Optional enumerations (if provided, must be valid)
      const div = normalizeEnumValue(row.division)
      if (row.division && !allowedDivisions.includes(div as any)) { rowErr.push('Invalid division'); mark(i, 'division') }
      const track = normalizeProgramTrack(row.program_track)
      if (div === 'college') {
        if (track && !allowedProgramTracks.includes(track as any)) {
          rowErr.push('Program track must be traditional or adult_ed'); mark(i, 'program_track')
        }
      } else if (track) {
        rowErr.push('Program track only applies to college division'); mark(i, 'program_track')
      }
      const gender = normalizeEnumValue(row.gender)
      if (row.gender && !allowedGenders.includes(gender as any)) { rowErr.push('Invalid gender'); mark(i, 'gender') }
      const race = normalizeEnumValue(row.race)
      if (row.race && !allowedRaces.includes(race as any)) { rowErr.push('Invalid race'); mark(i, 'race') }
      const ethnicity = normalizeEnumValue(row.ethnicity)
      if (row.ethnicity && !allowedEthnicities.includes(ethnicity as any)) { rowErr.push('Invalid ethnicity'); mark(i, 'ethnicity') }
      const lot = normalizeEnumValue(row.level_of_technology)
      if (row.level_of_technology && !allowedLevels.includes(lot as any)) { rowErr.push('Invalid level of technology'); mark(i, 'level_of_technology') }
      if (row.years_competing) {
        const n = parseInt(row.years_competing, 10)
        if (isNaN(n) || n < 0 || n > 20) { rowErr.push('Years competing must be 0-20'); mark(i, 'years_competing') }
      }
      if (rowErr.length) err[i] = rowErr
    })
    setErrors(err)
    setInvalid(invalidMap)
  }, [
    currentRows,
    allowedDivisions,
    allowedEthnicities,
    allowedGenders,
    allowedGrades,
    allowedLevels,
    allowedRaces,
    allowedProgramTracks,
  ])

  const errorCount = Object.keys(errors).length

  useEffect(() => {
    if (step !== 3) {
      setDuplicateConflicts({})
      setDuplicateCheckLoading(false)
      setDuplicateCheckError(null)
      return
    }

    if (!currentRows.length) {
      setDuplicateConflicts({})
      setDuplicateCheckLoading(false)
      setDuplicateCheckError(null)
      return
    }

    let cancelled = false

    const runCheck = async () => {
      setDuplicateCheckLoading(true)
      setDuplicateCheckError(null)
      try {
        const res = await fetch('/api/competitors/bulk-import/check-duplicates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rows: currentRows.map((row, index) => ({
              rowIndex: index,
              email_school: row.email_school,
              email_personal: row.email_personal,
            })),
          }),
        })

        if (!res.ok) {
          let message = 'Failed to check duplicates'
          try {
            const payload = await res.json()
            if (payload?.error) message = payload.error
          } catch {
            // ignore
          }
          throw new Error(message)
        }

        const data = await res.json()
        if (cancelled) return

        const friendlySource = (source: string) => {
          switch (source) {
            case 'profile':
              return 'Coach/Staff Profile Email'
            case 'competitor_school':
              return 'Competitor School Email'
            case 'competitor_personal':
              return 'Competitor Personal Email'
            default:
              return source
          }
        }

        const conflictMap: Record<number, { email_school?: string[]; email_personal?: string[] }> = {}

        const conflicts: Array<{
          rowIndex: number
          column: 'email_school' | 'email_personal'
          email: string
          conflictTypes?: string[]
          systemMatches?: Array<{ source: string }>
        }> = Array.isArray(data?.conflicts) ? data.conflicts : []

        for (const conflict of conflicts) {
          if (conflict.rowIndex === undefined || conflict.column === undefined) continue
          const entry = conflictMap[conflict.rowIndex] || {}
          const existingMessages = Array.isArray(entry[conflict.column]) ? entry[conflict.column]! : []

          if (conflict.conflictTypes?.includes('in_system')) {
            const sources = conflict.systemMatches?.map(match => friendlySource(match.source)) ?? []
            const message = sources.length
              ? `Matches existing records (${sources.join(', ')})`
              : 'Matches existing records in system'
            if (!existingMessages.includes(message)) existingMessages.push(message)
          }

          if (conflict.conflictTypes?.includes('in_file')) {
            const message = 'Duplicate email within uploaded file'
            if (!existingMessages.includes(message)) existingMessages.push(message)
          }

          if (existingMessages.length) {
            conflictMap[conflict.rowIndex] = {
              ...entry,
              [conflict.column]: existingMessages,
            }
          }
        }

        setDuplicateConflicts(conflictMap)
      } catch (error: any) {
        if (cancelled) return
        setDuplicateConflicts({})
        setDuplicateCheckError(error?.message || 'Failed to check duplicates')
      } finally {
        if (!cancelled) setDuplicateCheckLoading(false)
      }
    }

    runCheck()

    return () => {
      cancelled = true
    }
  }, [step, duplicateCheckKey, currentRows])

  const handleFile = async (file: File) => {
    setFileName(file.name)
    const isCSV = /\.(csv)$/i.test(file.name)
    const isExcel = /\.(xlsx|xls)$/i.test(file.name)
    if (isExcel) {
      if (/\.(xls)$/i.test(file.name)) {
        alert('Legacy .xls files are not supported. Please save as .xlsx or export to CSV.')
        return
      }
      try {
        const { Workbook } = await import('exceljs')
        const wb = new Workbook()
        const buf = await file.arrayBuffer()
        await wb.xlsx.load(buf)
        const sheet = wb.worksheets[0]
        if (!sheet) throw new Error('No worksheet found')
        const parsed: string[][] = []
        const maxCols = sheet.columnCount || 0
        sheet.eachRow((row) => {
          const arr: string[] = []
          for (let c = 1; c <= maxCols; c++) {
            const cell = row.getCell(c)
            const v = cell?.text ?? (cell?.value as any) ?? ''
            arr.push(typeof v === 'string' ? v : String(v ?? ''))
          }
          parsed.push(arr)
        })
        const sanitized = parsed.length > 0 && isDocumentationRow(parsed[0]) ? parsed.slice(1) : parsed
        setRows(sanitized)
        setHeaderIndex(0)
        setStep(2)
      } catch (e) {
        console.error('Excel parse error', e)
        alert('Failed to parse .xlsx file. Please export to CSV and try again.')
      }
      return
    }
    // CSV
    const text = await file.text()
    const parsed = parseCSV(text)
    setRaw(text)
    const sanitized = parsed.length > 0 && isDocumentationRow(parsed[0]) ? parsed.slice(1) : parsed
    setRows(sanitized)
    setHeaderIndex(0)
    setStep(2)
  }

  const updateEdit = (i: number, key: FieldKey, val: string) => {
    setEdited(prev => ({ ...prev, [i]: { ...(prev as any)[i], [key]: val } as any }))
  }

  // Helper to get allowed values for enumerated fields
  const getEnumOptions = (key: FieldKey): readonly string[] | null => {
    switch (key) {
      case 'division': return allowedDivisions
      case 'gender': return allowedGenders
      case 'race': return allowedRaces
      case 'ethnicity': return allowedEthnicities
      case 'level_of_technology': return allowedLevels
      case 'grade': return allowedGrades
      default: return null
    }
  }

  // Helper to format enum value for display
  const formatEnumLabel = (value: string): string => {
    return value.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }

  const startImport = async () => {
    if (isAdmin) return
    setSubmitting(true)
    try {
      const total = currentRows.length
      setProgress({ total, created: 0, updated: 0, duplicates: 0, failed: 0 })
      const chunkSize = 100
      for (let start = 0; start < total; start += chunkSize) {
        const chunk = currentRows.slice(start, start + chunkSize).map(serializeRowForApi)
        const res = await fetch('/api/competitors/bulk-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: chunk })
        })
        if (res.ok) {
          const j = await res.json()
          setProgress(p => ({
            total: p.total,
            created: p.created + (j.inserted || 0),
            updated: p.updated + (j.updated || 0),
            duplicates: p.duplicates + (j.duplicates ?? j.skipped ?? 0),
            failed: p.failed + (j.errors || 0),
          }))
        } else {
          setProgress(p => ({
            ...p,
            failed: p.failed + chunk.length,
          }))
        }
      }
      setStep(4)
    } finally {
      setSubmitting(false)
    }
  }


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-meta-light">Bulk Import</h1>
        <p className="text-meta-muted mt-2">Import competitors from CSV or Excel (.xlsx). Legacy .xls is not supported.</p>
        <ActingAsBanner />
      </div>

      <Card className="bg-meta-card border-meta-border">
        <CardHeader>
          <CardTitle className="text-meta-light">Import Wizard</CardTitle>
          <CardDescription className="text-meta-muted">Step {step} of 4</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-meta-muted">Select a CSV or .xlsx exported from your spreadsheet. The first row should contain column headers.</p>
              <p className="text-xs text-meta-muted">
                XLSX templates include documentation in the file but it&apos;s removed automatically here—leave the header row index at <code>0</code> unless your sheet has additional header rows of its own.
              </p>
              <div className="flex items-center gap-2">
                <Input type="file" accept=".csv,.xlsx" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} className="bg-meta-dark border-meta-border text-meta-light" />
                <Button
                  type="button"
                  variant="outline"
                  className="text-meta-light border-meta-border"
                  onClick={() => {
                    const headerLabelsCsv = COLUMN_ORDER.map((key) => FIELD_LOOKUP[key]?.label ?? key)
                    const csv = headerLabelsCsv.join(',') + '\n'
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = 'competitors-template.csv'
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                    URL.revokeObjectURL(url)
                  }}
                >
                  Download CSV Template
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="text-meta-light border-meta-border"
                  onClick={async () => {
                    try {
                      const { Workbook } = await import('exceljs')
                      const wb = new Workbook()
                      const ws = wb.addWorksheet('Template')
                      const headers = COLUMN_ORDER.map((key) => FIELD_LOOKUP[key]?.label ?? key)

                      const docRow = COLUMN_ORDER.map((key) => {
                        const fieldConfig = FIELD_LOOKUP[key]
                        const doc = fieldGuide[key]
                        const allowedValues = allowedValueLookup[key]
                        const parts: string[] = []
                        if (fieldConfig?.required) parts.push('[Required]')
                        if (doc?.description) parts.push(doc.description)
                        else if (fieldConfig?.hint) parts.push(fieldConfig.hint)
                        if (allowedValues) parts.push(`Allowed: ${allowedValues.join(' | ')}`)
                        return parts.join(' ')
                      })
                      ws.addRow(docRow)
                      const docRowRef = ws.getRow(1)
                      docRowRef.font = { italic: true, color: { argb: 'FF4B5563' } }
                      docRowRef.alignment = { wrapText: true, vertical: 'top' }
                      docRowRef.height = 60
                      docRowRef.eachCell((cell) => {
                        cell.fill = {
                          type: 'pattern',
                          pattern: 'solid',
                          fgColor: { argb: 'FFF3F4F6' },
                        }
                      })

                      const headerRow = ws.addRow(headers)
                      headerRow.font = { bold: true }
                      headerRow.alignment = { wrapText: true }
                      ws.columns = headers.map(() => ({ width: 40 }))
                      const ws2 = wb.addWorksheet('Cheat Sheet')
                      ws2.addRow(['Field','Allowed Values'])
                      ws2.getRow(1).font = { bold: true }
                      const add = (name: string, values: readonly string[]) => ws2.addRow([name, values.join(' | ')])
                      add('grade', allowedGrades)
                      add('division', allowedDivisions)
                      add('program_track (college only)', allowedProgramTracks)
                      add('gender', allowedGenders)
                      add('race', allowedRaces)
                      add('ethnicity', allowedEthnicities)
                      add('level_of_technology', allowedLevels)
                      const buf = await wb.xlsx.writeBuffer()
                      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = 'competitors-template.xlsx'
                      document.body.appendChild(a)
                      a.click()
                      document.body.removeChild(a)
                      URL.revokeObjectURL(url)
                    } catch (e) {
                      console.error('Template generation failed', e)
                    }
                  }}
                >
                  Download XLSX Template + Cheat Sheet
                </Button>
              </div>
              <div className="flex items-center gap-2">
                {/* Wizard is default on this page; no external importer */}
              </div>
              {/* Cheat sheet inline */}
              <div className="mt-4 p-3 border border-meta-border rounded bg-meta-dark">
                <div className="text-sm text-meta-light font-medium mb-2">Allowed Values (strict)</div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-meta-muted">
      <div>
        <div className="font-semibold text-meta-light">grade</div>
        <div>{allowedGrades.join(', ')}</div>
      </div>
                  <div>
                    <div className="font-semibold text-meta-light">division</div>
                    <div>{allowedDivisions.join(', ')}</div>
                  </div>
                  <div>
                    <div className="font-semibold text-meta-light">gender</div>
                    <div>{allowedGenders.join(', ')}</div>
                  </div>
                  <div>
                    <div className="font-semibold text-meta-light">race</div>
                    <div>{allowedRaces.join(', ')}</div>
                  </div>
                  <div>
                    <div className="font-semibold text-meta-light">ethnicity</div>
                    <div>{allowedEthnicities.join(', ')}</div>
                  </div>
                  <div>
        <div className="font-semibold text-meta-light">level_of_technology</div>
        <div>{allowedLevels.join(', ')}</div>
      </div>
      <div>
        <div className="font-semibold text-meta-light">program_track</div>
        <div>{allowedProgramTracks.join(', ')}</div>
      </div>
    </div>
                <div className="text-xs text-meta-muted mt-3">
                  <div className="font-medium text-meta-light mb-1">Non-enumerated fields</div>
                  <ul className="list-disc pl-5 space-y-1">
                    <li><span className="font-semibold text-meta-light">email_school</span>: required for all participants; must be a valid email.</li>
                    <li><span className="font-semibold text-meta-light">email_personal</span>: optional; if present must be a valid email.</li>
                    <li><span className="font-semibold text-meta-light">program_track</span>: optional; only used when division is <code>college</code>. Leave blank or <code>traditional</code> for traditional students, use <code>adult_ed</code> for continuing/adult education.</li>
                    <li><span className="font-semibold text-meta-light">parent_name</span>: optional for minors at import.</li>
                    <li><span className="font-semibold text-meta-light">parent_email</span>: required if <em>parent_name</em> is provided; otherwise optional. If present, must be a valid email.</li>
                  </ul>
                  <div className="mt-2">Values are case-insensitive; we store canonical tokens shown above. School email is required for all participants. For minors, parent name is optional; if provided, parent email is required.</div>
                </div>
              </div>
              <details className="mt-4 border border-meta-border rounded bg-meta-dark/70 text-meta-light">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Field Reference Guide</summary>
                <div className="px-3 pb-3">
                  <div className="overflow-x-auto mt-3 border border-meta-border/80 rounded">
                    <table className="min-w-full text-xs text-left">
                      <thead className="bg-meta-dark text-meta-light uppercase tracking-wide">
                        <tr>
                          <th className="px-3 py-2">Field</th>
                          <th className="px-3 py-2">Required?</th>
                          <th className="px-3 py-2">Description</th>
                          <th className="px-3 py-2 whitespace-nowrap">Allowed Values</th>
                        </tr>
                      </thead>
                      <tbody>
                        {FIELDS.map((field) => {
                          const doc = fieldGuide[field.key]
                          const allowedValues = allowedValueLookup[field.key]
                          return (
                            <tr key={field.key} className="border-t border-meta-border/60">
                              <td className="px-3 py-2 font-medium text-meta-light whitespace-nowrap">{field.label}</td>
                              <td className="px-3 py-2 text-meta-light">{field.required ? 'Yes' : 'Optional'}</td>
                              <td className="px-3 py-2 text-meta-muted">{doc?.description || field.hint || '—'}</td>
                              <td className="px-3 py-2 text-meta-muted whitespace-pre-wrap">
                                {allowedValues ? allowedValues.join(', ') : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[11px] text-meta-muted mt-2">
                    Tip: leave optional columns blank if you prefer to complete them later inside the dashboard. Program track applies only to college division rows.
                  </p>
                </div>
              </details>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="text-sm text-meta-muted">File: {fileName || 'untitled'}</div>
              <div className="flex items-center gap-2">
                <label className="text-sm">Header row index:</label>
                <Input type="number" min={0} max={Math.max(0, rows.length - 1)} value={headerIndex} onChange={e => setHeaderIndex(Math.max(0, Math.min(rows.length - 1, parseInt(e.target.value || '0', 10))))} className="w-24 bg-meta-dark border-meta-border text-meta-light" />
              </div>
              <div className="overflow-auto border border-meta-border rounded">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-meta-dark text-meta-light">
                      {headers.map((h, i) => <th key={i} className="px-2 py-1 border-b border-meta-border text-left">{h || `(col ${i+1})`}</th>)}
                    </tr>
                  </thead>
                </table>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {FIELDS.map(f => (
                  <div key={f.key} className="flex items-center gap-2">
                    <label className="w-56 text-sm text-meta-light">{f.label}{f.required && <span className="text-red-500"> *</span>}</label>
                    <select className="flex-1 bg-meta-dark border border-meta-border text-meta-light rounded px-2 py-1" value={mapping[f.key] ?? ''} onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value === '' ? null : Number(e.target.value) }))}>
                      <option value="">Not mapped</option>
                      {headers.map((h, idx) => <option key={idx} value={idx}>{h || `Column ${idx+1}`}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)} className="text-meta-light border-meta-border">Back</Button>
                <Button onClick={() => setStep(3)} className="bg-meta-accent text-white">Review Data</Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="text-sm text-meta-muted">Rows: {currentRows.length}. Errors: {errorCount}. Click cells to edit.</div>
              {duplicateCheckLoading && (
                <div className="text-sm text-meta-muted">Checking for duplicate emails…</div>
              )}
              {duplicateCheckError && (
                <div className="text-sm text-red-400">{duplicateCheckError}</div>
              )}
              {!duplicateCheckLoading && !duplicateCheckError && duplicateRowCount > 0 && (
                <div className="text-sm text-amber-300">
                  Duplicate emails detected in {duplicateRowCount} {duplicateRowCount === 1 ? 'row' : 'rows'}. These entries will be skipped or update existing records during import.
                </div>
              )}
              <div className="overflow-x-auto overflow-y-auto border border-meta-border rounded max-h-[28rem]">
                <table className="min-w-[1400px] text-xs">
                  <thead>
                    <tr className="bg-meta-dark text-meta-light sticky top-0">
                      <th className="px-2 py-1 border-b border-meta-border text-left text-xs whitespace-nowrap">#</th>
                      {FIELDS.map(f => (
                        <th key={f.key} className="px-2 py-1 border-b border-meta-border text-left text-xs whitespace-nowrap">{f.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {currentRows.map((r, i) => (
                      <tr key={i} className={errors[i]?.length ? 'bg-red-50/10' : ''}>
                        <td className="px-2 py-1 border-b border-meta-border text-meta-muted">{i + 1}</td>
                        {FIELDS.map(f => {
                            const rawValue = (edited[i]?.[f.key] ?? r[f.key]) || ''
                            const enumOptions = getEnumOptions(f.key)
                            const isInvalid = invalid[i]?.[f.key]
                            const isEmailField = f.key === 'email_school' || f.key === 'email_personal'
                            const duplicateMessages = isEmailField ? duplicateConflicts[i]?.[f.key as 'email_school' | 'email_personal'] : undefined
                            const hasDuplicate = Array.isArray(duplicateMessages) && duplicateMessages.length > 0
                            const borderClass = isInvalid
                              ? 'border-red-500 ring-1 ring-red-500/70'
                              : hasDuplicate
                                ? 'border-amber-500 ring-1 ring-amber-500/70'
                                : 'border-meta-border'

                            // Normalize the value for enum fields to match the select options
                            let displayValue = rawValue
                            if (enumOptions) {
                              if (f.key === 'grade') {
                                displayValue = normalizeGrade(rawValue)
                              } else {
                                displayValue = normalizeEnumValue(rawValue)
                              }
                            }

                            return (
                              <td key={f.key} className="px-2 py-1 border-b border-meta-border whitespace-nowrap align-top">
                                {enumOptions ? (
                                  <div className="flex flex-col gap-1">
                                    <select
                                      value={displayValue}
                                      onChange={e => updateEdit(i, f.key, e.target.value)}
                                      className={`bg-meta-dark border ${borderClass} text-meta-light h-8 text-xs rounded px-2 focus-visible:ring-1 focus-visible:ring-meta-accent ${
                                        (f.key === 'grade') ? 'w-32' :
                                        (f.key === 'division' || f.key === 'gender' || f.key === 'race' || f.key === 'ethnicity' || f.key === 'level_of_technology') ? 'w-56' :
                                        'w-40'
                                      }`}
                                    >
                                      <option value="">-- Select --</option>
                                      {enumOptions.map(opt => (
                                        <option key={opt} value={opt}>
                                          {formatEnumLabel(opt)}
                                        </option>
                                      ))}
                                    </select>
                                    {rawValue && isInvalid && (
                                      <div className="text-[10px] text-red-400 italic truncate max-w-[14rem]" title={`Original value: ${rawValue}`}>
                                        Was: "{rawValue}"
                                      </div>
                                    )}
                                    {hasDuplicate && duplicateMessages!.map((msg, idx) => (
                                      <div key={idx} className="text-[10px] text-amber-300 italic max-w-[14rem]">
                                        {msg}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="flex flex-col gap-1">
                                    <Input
                                      value={rawValue}
                                      onChange={e => updateEdit(i, f.key, e.target.value)}
                                      className={`bg-meta-dark border ${borderClass} text-meta-light h-8 text-xs focus-visible:ring-1 focus-visible:ring-meta-accent ${
                                        (f.key === 'first_name' || f.key === 'last_name') ? 'w-40' :
                                        (f.key === 'is_18_or_over') ? 'w-28' :
                                        (f.key === 'years_competing') ? 'w-24' :
                                        (f.key === 'email_school' || f.key === 'email_personal' || f.key === 'parent_email') ? 'w-56' :
                                        (f.key === 'parent_name') ? 'w-48' :
                                        'w-40'
                                      }`}
                                    />
                                    {hasDuplicate && duplicateMessages!.map((msg, idx) => (
                                      <div key={idx} className="text-[10px] text-amber-300 italic max-w-[14rem]">
                                        {msg}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                            )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {errorCount > 0 && (
                <div className="text-sm text-red-500">Fix errors before importing. Example (row → errors): {Object.entries(errors).slice(0,3).map(([i, e]) => `#${Number(i)+1}: ${e.join('; ')}`).join(' | ')}{Object.keys(errors).length>3?' …':''}</div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)} className="text-meta-light border-meta-border">Back</Button>
                <Button onClick={startImport} disabled={isAdmin || submitting || errorCount > 0} className="bg-meta-accent text-white" title={isAdmin ? 'Bulk import is coach-only' : undefined}>
                  {submitting ? 'Importing…' : 'Start Import'}
                </Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <div className="text-meta-light">Import Complete</div>
              <div className="text-sm text-meta-muted">Processed {progress.total} rows.</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded border border-meta-border bg-meta-dark px-3 py-2">
                  <div className="text-meta-muted text-xs uppercase tracking-wide">Created</div>
                  <div className="text-meta-light text-lg font-semibold">{progress.created}</div>
                </div>
                <div className="rounded border border-meta-border bg-meta-dark px-3 py-2">
                  <div className="text-meta-muted text-xs uppercase tracking-wide">Updated</div>
                  <div className="text-meta-light text-lg font-semibold">{progress.updated}</div>
                </div>
                <div className="rounded border border-meta-border bg-meta-dark px-3 py-2">
                  <div className="text-meta-muted text-xs uppercase tracking-wide">Duplicate Emails Skipped</div>
                  <div className="text-amber-300 text-lg font-semibold">{progress.duplicates}</div>
                </div>
                <div className="rounded border border-meta-border bg-meta-dark px-3 py-2">
                  <div className="text-meta-muted text-xs uppercase tracking-wide">Failed</div>
                  <div className="text-red-300 text-lg font-semibold">{progress.failed}</div>
                </div>
              </div>
              <div className="text-xs text-meta-muted">
                Successful imports: {progress.created + progress.updated}. Resolve duplicates or failures above before re-importing any remaining competitors.
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setStep(1);
                    setRows([]);
                    setEdited([]);
                    setErrors({});
                    setDuplicateConflicts({});
                    setDuplicateCheckError(null);
                    setDuplicateCheckLoading(false);
                    setProgress({ total: 0, created: 0, updated: 0, duplicates: 0, failed: 0 });
                  }}
                  className="bg-meta-accent text-white"
                >
                  Import Another File
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* No external importer; using built-in wizard */}
    </div>
  )
}
