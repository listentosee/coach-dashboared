'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import ActingAsBanner from '@/components/admin/ActingAsBanner'
import { ALLOWED_DIVISIONS, ALLOWED_ETHNICITIES, ALLOWED_GENDERS, ALLOWED_GRADES, ALLOWED_LEVELS_OF_TECHNOLOGY, ALLOWED_RACES } from '@/lib/constants/enums'
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

type FieldConfig = {
  key: FieldKey
  label: string
  required?: boolean
  hint?: string
}

const FIELDS: FieldConfig[] = [
  { key: 'first_name', label: 'First Name', required: true },
  { key: 'last_name', label: 'Last Name', required: true },
  { key: 'is_18_or_over', label: 'Is Adult (Y/N/True/False)', required: true, hint: 'Values like Y, Yes, True, 1 map to true' },
  { key: 'grade', label: 'Grade', required: true },
  { key: 'email_school', label: 'School Email (Required)', required: true },
  { key: 'email_personal', label: 'Personal Email (Optional)' },
  { key: 'parent_name', label: 'Parent Name (Minor)' },
  { key: 'parent_email', label: 'Parent Email (Minor)' },
  { key: 'division', label: 'Division (middle_school | high_school | college)' },
  { key: 'gender', label: 'Gender (male | female | other | prefer_not_to_say)' },
  { key: 'race', label: 'Race (white | black | hispanic | asian | native | pacific | other)' },
  { key: 'ethnicity', label: 'Ethnicity (not_hispanic | hispanic)' },
  { key: 'level_of_technology', label: 'Level of Technology (PC | MAC | Chrome book | Linux | Other)' },
  { key: 'years_competing', label: 'Years Competing (0-20)' },
]

type Row = Record<FieldKey, string>
type ParsedRow = string[]

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
  })
  const [edited, setEdited] = useState<Row[]>([])
  const [errors, setErrors] = useState<Record<number, string[]>>({})
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState<{ total: number; done: number; failed: number }>({ total: 0, done: 0, failed: 0 })

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

  // Validate
  useEffect(() => {
    const err: Record<number, string[]> = {}
    currentRows.forEach((row, i) => {
      const rowErr: string[] = []
      if (!row.first_name) rowErr.push('First name required')
      if (!row.last_name) rowErr.push('Last name required')
      const isAdult = parseBoolean(row.is_18_or_over)
      if (isAdult === null) rowErr.push('Is Adult must be Y/N or True/False')
      if (!row.grade) rowErr.push('Grade required')
      if (row.grade && !allowedGrades.includes(String(row.grade).trim().toLowerCase())) rowErr.push('Invalid grade')
      // School email is required for all participants
      if (!isValidEmail(row.email_school)) rowErr.push('School email is required and must be valid')
      if (isAdult === false) {
        // Validate parent email when parent name is provided (required if name present)
        if (row.parent_name && !isValidEmail(row.parent_email)) rowErr.push('Parent email is required and must be valid when parent name is provided')
        // If no parent name, allow parent email to be empty; if present, must be valid
        if (!row.parent_name && row.parent_email && !isValidEmail(row.parent_email)) rowErr.push('Parent email is invalid')
      }
      // Optional enumerations (if provided, must be valid)
      if (row.division && !allowedDivisions.includes(row.division.trim().toLowerCase())) rowErr.push('Invalid division')
      if (row.gender && !allowedGenders.includes(row.gender.trim().toLowerCase())) rowErr.push('Invalid gender')
      if (row.race && !allowedRaces.includes(row.race.trim().toLowerCase())) rowErr.push('Invalid race')
      if (row.ethnicity && !allowedEthnicities.includes(row.ethnicity.trim().toLowerCase())) rowErr.push('Invalid ethnicity')
      if (row.level_of_technology && !allowedLevels.includes(row.level_of_technology.trim().toLowerCase())) rowErr.push('Invalid level of technology')
      if (row.years_competing) {
        const n = parseInt(row.years_competing, 10)
        if (isNaN(n) || n < 0 || n > 20) rowErr.push('Years competing must be 0-20')
      }
      if (rowErr.length) err[i] = rowErr
    })
    setErrors(err)
  }, [currentRows])

  const errorCount = Object.keys(errors).length

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
        setRows(parsed)
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
    setRows(parsed)
    setHeaderIndex(0)
    setStep(2)
  }

  const updateEdit = (i: number, key: FieldKey, val: string) => {
    setEdited(prev => ({ ...prev, [i]: { ...(prev as any)[i], [key]: val } as any }))
  }

  const startImport = async () => {
    if (isAdmin) return
    setSubmitting(true)
    try {
      const total = currentRows.length
      setProgress({ total, done: 0, failed: 0 })
      const chunkSize = 100
      for (let start = 0; start < total; start += chunkSize) {
        const chunk = currentRows.slice(start, start + chunkSize)
        const res = await fetch('/api/competitors/bulk-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: chunk })
        })
        if (res.ok) {
          const j = await res.json()
          setProgress(p => ({ total: p.total, done: p.done + (j.inserted || 0) + (j.updated || 0) + (j.skipped || 0), failed: p.failed + (j.errors || 0) }))
        } else {
          setProgress(p => ({ ...p, failed: p.failed + chunk.length }))
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
              <div className="flex items-center gap-2">
                <Input type="file" accept=".csv,.xlsx" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} className="bg-meta-dark border-meta-border text-meta-light" />
                <Button
                  type="button"
                  variant="outline"
                  className="text-meta-light border-meta-border"
                  onClick={() => {
                    const headers = ['First Name','Last Name','Is Adult (Y/N/True/False)','Grade','School Email (Required)','Personal Email (Optional)','Parent Name (Minor)','Parent Email (Minor)','Division','Gender','Race','Ethnicity','Level of Technology','Years Competing']
                    const csv = headers.join(',') + '\n'
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
                      const headers = ['First Name','Last Name','Is Adult (Y/N/True/False)','Grade','School Email (Required)','Personal Email (Optional)','Parent Name (Minor)','Parent Email (Minor)','Division','Gender','Race','Ethnicity','Level of Technology','Years Competing']
                      ws.addRow(headers)
                      ws.getRow(1).font = { bold: true }
                      const ws2 = wb.addWorksheet('Cheat Sheet')
                      ws2.addRow(['Field','Allowed Values'])
                      ws2.getRow(1).font = { bold: true }
                      const add = (name: string, values: readonly string[]) => ws2.addRow([name, values.join(' | ')])
                      add('grade', allowedGrades)
                      add('division', allowedDivisions)
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
                </div>
                <div className="text-xs text-meta-muted mt-3">
                  <div className="font-medium text-meta-light mb-1">Non-enumerated fields</div>
                  <ul className="list-disc pl-5 space-y-1">
                    <li><span className="font-semibold text-meta-light">email_school</span>: required for all participants; must be a valid email.</li>
                    <li><span className="font-semibold text-meta-light">email_personal</span>: optional; if present must be a valid email.</li>
                    <li><span className="font-semibold text-meta-light">parent_name</span>: optional for minors at import.</li>
                    <li><span className="font-semibold text-meta-light">parent_email</span>: required if <em>parent_name</em> is provided; otherwise optional. If present, must be a valid email.</li>
                  </ul>
                  <div className="mt-2">Values are case-insensitive; we store canonical tokens shown above. School email is required for all participants. For minors, parent name is optional; if provided, parent email is required.</div>
                </div>
              </div>
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
                        {FIELDS.map(f => (
                          <td key={f.key} className="px-2 py-1 border-b border-meta-border whitespace-nowrap">
                            <Input
                              value={(edited[i]?.[f.key] ?? r[f.key]) || ''}
                              onChange={e => updateEdit(i, f.key, e.target.value)}
                              className={`bg-meta-dark border-meta-border text-meta-light h-8 text-xs ${
                                (f.key === 'first_name' || f.key === 'last_name') ? 'w-40' :
                                (f.key === 'is_18_or_over') ? 'w-28' :
                                (f.key === 'grade' || f.key === 'years_competing') ? 'w-24' :
                                (f.key === 'email_school' || f.key === 'email_personal' || f.key === 'parent_email') ? 'w-56' :
                                (f.key === 'parent_name') ? 'w-48' :
                                (f.key === 'division' || f.key === 'gender' || f.key === 'race' || f.key === 'ethnicity' || f.key === 'level_of_technology') ? 'w-56' :
                                'w-40'
                              }`}
                            />
                          </td>
                        ))}
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
              <div className="text-sm text-meta-muted">Processed {progress.total} rows. Success: {progress.done - progress.failed}. Failed: {progress.failed}.</div>
              <div className="flex gap-2">
                <Button onClick={() => { setStep(1); setRows([]); setEdited([]); setErrors({}); setProgress({ total: 0, done: 0, failed: 0 }) }} className="bg-meta-accent text-white">Import Another File</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* No external importer; using built-in wizard */}
    </div>
  )
}
