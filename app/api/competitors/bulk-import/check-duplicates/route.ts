import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { findEmailConflicts, normalizeEmail } from '@/lib/validation/email-uniqueness'

type CheckRow = {
  rowIndex: number
  email_school?: string | null
  email_personal?: string | null
}

type ConflictType = 'in_system' | 'in_file'

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if ((profile as any)?.role === 'admin') {
      return NextResponse.json({ error: 'Bulk import duplicate check is available to coaches only' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({})) as { rows?: CheckRow[] }
    const rows = Array.isArray(body.rows) ? body.rows : []
    if (!rows.length) {
      return NextResponse.json({ conflicts: [] })
    }

    const emailOccurrences = new Map<string, Array<{ rowIndex: number; column: 'email_school' | 'email_personal' }>>()

    for (const row of rows) {
      const index = Number.isFinite(row.rowIndex) ? Number(row.rowIndex) : null
      if (index === null || index < 0) continue

      const school = normalizeEmail(row.email_school)
      const personal = normalizeEmail(row.email_personal)

      if (school) {
        const list = emailOccurrences.get(school) || []
        list.push({ rowIndex: index, column: 'email_school' })
        emailOccurrences.set(school, list)
      }

      if (personal) {
        const list = emailOccurrences.get(personal) || []
        list.push({ rowIndex: index, column: 'email_personal' })
        emailOccurrences.set(personal, list)
      }
    }

    if (!emailOccurrences.size) {
      return NextResponse.json({ conflicts: [] })
    }

    const uniqueEmails = Array.from(emailOccurrences.keys())

    const conflictResult = await findEmailConflicts({
      supabase,
      emails: uniqueEmails,
    })

    const conflictsByEmail = new Map<string, typeof conflictResult.conflicts>()
    for (const email of uniqueEmails) {
      conflictsByEmail.set(email, [])
    }
    for (const conflict of conflictResult.conflicts) {
      const email = conflict.email
      const list = conflictsByEmail.get(email)
      if (list) {
        list.push(conflict)
      } else {
        conflictsByEmail.set(email, [conflict])
      }
    }

    const responseConflicts: Array<{
      rowIndex: number
      column: 'email_school' | 'email_personal'
      email: string
      conflictTypes: ConflictType[]
      systemMatches?: Array<{
        source: string
        recordId: string
        coachId?: string | null
      }>
    }> = []

    for (const [email, occurrences] of emailOccurrences.entries()) {
      const systemMatches = conflictsByEmail.get(email) ?? []
      const hasSystemConflict = systemMatches.length > 0
      const hasInFileConflict = occurrences.length > 1

      if (!hasSystemConflict && !hasInFileConflict) continue

      const conflictTypes: ConflictType[] = []
      if (hasSystemConflict) conflictTypes.push('in_system')
      if (hasInFileConflict) conflictTypes.push('in_file')

      for (const occurrence of occurrences) {
        responseConflicts.push({
          rowIndex: occurrence.rowIndex,
          column: occurrence.column,
          email,
          conflictTypes,
          systemMatches: hasSystemConflict
            ? systemMatches.map(match => ({
                source: match.source,
                recordId: match.recordId,
                coachId: match.coachId ?? null,
              }))
            : undefined,
        })
      }
    }

    return NextResponse.json({ conflicts: responseConflicts })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
