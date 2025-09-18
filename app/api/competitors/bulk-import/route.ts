import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { ALLOWED_DIVISIONS, ALLOWED_ETHNICITIES, ALLOWED_GENDERS, ALLOWED_GRADES, ALLOWED_LEVELS_OF_TECHNOLOGY, ALLOWED_RACES } from '@/lib/constants/enums'
import { normalizeEnumValue, normalizeGrade } from '@/lib/utils/import-normalize'

type IncomingRow = {
  first_name?: string
  last_name?: string
  is_18_or_over?: string | boolean
  grade?: string
  email_school?: string
  email_personal?: string
  parent_name?: string
  parent_email?: string
  division?: string
  gender?: string
  race?: string
  ethnicity?: string
  level_of_technology?: string
  years_competing?: string | number
}

function parseBoolean(input: any): boolean | null {
  if (typeof input === 'boolean') return input
  const v = String(input ?? '').trim().toLowerCase()
  if (!v) return null
  if (['y','yes','true','1'].includes(v)) return true
  if (['n','no','false','0'].includes(v)) return false
  return null
}

function isValidEmail(email?: string | null) {
  if (!email) return false
  const e = email.trim().toLowerCase()
  return /.+@.+\..+/.test(e)
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Admin context handling
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    const isAdmin = profile?.role === 'admin'
    // Coach-only: disallow admins even with acting context
    if (isAdmin) return NextResponse.json({ error: 'Bulk import is available to coaches only' }, { status: 403 })

    const body = await req.json().catch(() => ({})) as { rows?: IncomingRow[], onConflict?: 'skip'|'update' }
    const onConflict = body.onConflict || 'skip'
    const inputRows: IncomingRow[] = Array.isArray(body.rows) ? body.rows : []
    if (inputRows.length === 0) return NextResponse.json({ error: 'No rows provided' }, { status: 400 })

    const coachId = user.id

    let inserted = 0, updated = 0, skipped = 0, errors = 0

    // Enumerations (strict)
    const allowedDivisions = ALLOWED_DIVISIONS as readonly string[]
    const allowedGenders = ALLOWED_GENDERS as readonly string[]
    const allowedRaces = ALLOWED_RACES as readonly string[]
    const allowedEthnicities = ALLOWED_ETHNICITIES as readonly string[]
    const allowedLevels = ALLOWED_LEVELS_OF_TECHNOLOGY as readonly string[]
    const allowedGrades = ALLOWED_GRADES as readonly string[]

    for (const raw of inputRows) {
      try {
        const first_name = (raw.first_name || '').trim()
        const last_name = (raw.last_name || '').trim()
        const grade = normalizeGrade(raw.grade)
        const isAdult = parseBoolean(raw.is_18_or_over)
        const email_school = (raw.email_school || '').trim().toLowerCase()
        const email_personal = (raw.email_personal || '').trim().toLowerCase()
        const parent_name = (raw.parent_name || '').trim()
        const parent_email = (raw.parent_email || '').trim().toLowerCase()
        const division = normalizeEnumValue(raw.division)
        const gender = normalizeEnumValue(raw.gender)
        const race = normalizeEnumValue(raw.race)
        const ethnicity = normalizeEnumValue(raw.ethnicity)
        const level_of_technology = normalizeEnumValue(raw.level_of_technology)
        const years_competing_raw = typeof raw.years_competing === 'number' ? raw.years_competing : (raw.years_competing || '').toString().trim()
        const years_competing = years_competing_raw === '' ? null : Number.parseInt(String(years_competing_raw), 10)

        // Validate
        if (!first_name || !last_name || !grade || isAdult === null) throw new Error('Missing required fields')
        if (!allowedGrades.includes(grade)) throw new Error('Invalid grade')
        // School email is required for all participants
        if (!isValidEmail(email_school)) throw new Error('School email is required and must be valid')
        // For minors: if parent name provided, parent email is required
        if (!isAdult) {
          if (parent_name && !isValidEmail(parent_email)) throw new Error('Parent email is required and must be valid when parent name is provided')
          if (!parent_name && parent_email && !isValidEmail(parent_email)) throw new Error('Parent email is invalid')
        }
        if (division && !allowedDivisions.includes(division)) throw new Error('Invalid division')
        if (gender && !allowedGenders.includes(gender)) throw new Error('Invalid gender')
        if (race && !allowedRaces.includes(race)) throw new Error('Invalid race')
        if (ethnicity && !allowedEthnicities.includes(ethnicity)) throw new Error('Invalid ethnicity')
        if (level_of_technology && !allowedLevels.includes(level_of_technology)) throw new Error('Invalid level_of_technology')
        if (years_competing !== null && (Number.isNaN(years_competing) || years_competing! < 0 || years_competing! > 20)) throw new Error('Invalid years_competing')

        // Duplicate check by coach + primary email (school or personal)
        const dedupeEmail = email_school || email_personal || parent_email || null
        let existingId: string | null = null
        if (dedupeEmail) {
          const { data: existing } = await supabase
            .from('competitors')
            .select('id, email_school, email_personal, coach_id')
            .eq('coach_id', coachId)
            .or(`email_school.eq.${dedupeEmail},email_personal.eq.${dedupeEmail}`)
            .limit(1)
            .maybeSingle()
          existingId = existing?.id || null
        }

        if (existingId) {
          if (onConflict === 'skip') { skipped++; continue }
          const { error: updErr } = await supabase
            .from('competitors')
            .update({
              first_name, last_name, grade,
              is_18_or_over: isAdult,
              email_school: email_school || null,
              email_personal: email_personal || null,
              parent_name: parent_name || null,
              parent_email: parent_email || null,
              division: division || null,
              gender: gender || null,
              race: race || null,
              ethnicity: ethnicity || null,
              level_of_technology: level_of_technology || null,
              years_competing: years_competing as number | null,
            })
            .eq('id', existingId)
          if (updErr) throw updErr
          updated++
          continue
        }

        const { error: insErr } = await supabase
          .from('competitors')
          .insert({
            coach_id: coachId,
            first_name, last_name, grade,
            is_18_or_over: isAdult,
            email_school: email_school || null,
            email_personal: email_personal || null,
            parent_name: parent_name || null,
            parent_email: parent_email || null,
            division: division || null,
            gender: gender || null,
            race: race || null,
            ethnicity: ethnicity || null,
            level_of_technology: level_of_technology || null,
            years_competing: years_competing as number | null,
            status: 'profile',
            is_active: true,
          })
        if (insErr) throw insErr
        inserted++
      } catch (e) {
        errors++
      }
    }

    return NextResponse.json({ inserted, updated, skipped, errors })
  } catch (e) {
    console.error('Bulk import error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
