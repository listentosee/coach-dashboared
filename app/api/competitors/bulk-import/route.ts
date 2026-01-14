import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { ALLOWED_DIVISIONS, ALLOWED_ETHNICITIES, ALLOWED_GENDERS, ALLOWED_GRADES, ALLOWED_LEVELS_OF_TECHNOLOGY, ALLOWED_RACES, ALLOWED_PROGRAM_TRACKS } from '@/lib/constants/enums'
import { normalizeEnumValue, normalizeGrade, normalizeProgramTrack } from '@/lib/utils/import-normalize'
import { AuditLogger } from '@/lib/audit/audit-logger';
import { logger } from '@/lib/logging/safe-logger';
import { assertEmailsUnique, EmailConflictError } from '@/lib/validation/email-uniqueness';
import { calculateCompetitorStatus } from '@/lib/utils/competitor-status';
import { enqueueJob } from '@/lib/jobs/queue';

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
  program_track?: string
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
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
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

    let inserted = 0, updated = 0, skipped = 0, errors = 0, duplicates = 0
    const errorDetails: Array<{ row: number; name: string; error: string }> = []
    const autoOnboardIds: string[] = []

    // Enumerations (strict)
    const allowedDivisions = ALLOWED_DIVISIONS as readonly string[]
    const allowedGenders = ALLOWED_GENDERS as readonly string[]
    const allowedRaces = ALLOWED_RACES as readonly string[]
    const allowedEthnicities = ALLOWED_ETHNICITIES as readonly string[]
    const allowedLevels = ALLOWED_LEVELS_OF_TECHNOLOGY as readonly string[]
    const allowedGrades = ALLOWED_GRADES as readonly string[]

    for (let rowIndex = 0; rowIndex < inputRows.length; rowIndex++) {
      const raw = inputRows[rowIndex]
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
        const rawProgramTrack = normalizeProgramTrack(raw.program_track)
        let program_track: string | null = null
        if (division === 'college') {
          if (rawProgramTrack === 'adult_ed') {
            program_track = 'adult_ed'
          } else if (rawProgramTrack === 'traditional') {
            program_track = 'traditional'
          } else if ((raw.program_track || '').trim() === '') {
            program_track = 'traditional'
          } else {
            throw new Error('Invalid program track for college competitor')
          }
        }
        if (division !== 'college' && rawProgramTrack) {
          program_track = null
        }

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
        if (program_track && !ALLOWED_PROGRAM_TRACKS.includes(program_track as any)) throw new Error('Invalid program_track')
        if (gender && !allowedGenders.includes(gender)) throw new Error('Invalid gender')
        if (race && !allowedRaces.includes(race)) throw new Error('Invalid race')
        if (ethnicity && !allowedEthnicities.includes(ethnicity)) throw new Error('Invalid ethnicity')
        if (level_of_technology && !allowedLevels.includes(level_of_technology)) throw new Error('Invalid level_of_technology')
        if (years_competing !== null && (Number.isNaN(years_competing) || years_competing! < 0 || years_competing! > 20)) throw new Error('Invalid years_competing')

        // Duplicate check by coach + primary email (school or personal)
        const dedupeEmail = email_school || email_personal || parent_email || null
        let existingId: string | null = null
        let existingParentEmail: string | null = null
        if (dedupeEmail) {
          const { data: existing } = await supabase
            .from('competitors')
            .select('id, email_school, email_personal, coach_id, parent_email')
            .eq('coach_id', coachId)
            .or(`email_school.eq.${dedupeEmail},email_personal.eq.${dedupeEmail}`)
            .limit(1)
            .maybeSingle()
          existingId = existing?.id || null
          existingParentEmail = existing?.parent_email ? String(existing.parent_email).trim().toLowerCase() : null
        }

        try {
          await assertEmailsUnique({
            supabase,
            emails: [email_school || null, email_personal || null],
            ignoreCompetitorIds: existingId ? [existingId] : [],
          });
        } catch (error) {
          if (error instanceof EmailConflictError) {
            duplicates++
            skipped++
            continue
          }
          throw error;
        }

        if (existingId) {
          if (onConflict === 'skip') { skipped++; duplicates++; continue }
          const incomingParentEmail = parent_email ? String(parent_email).trim().toLowerCase() : null
          const parentEmailChanged = existingParentEmail !== incomingParentEmail
          const { error: updErr } = await supabase
            .from('competitors')
            .update({
              first_name, last_name, grade,
              is_18_or_over: isAdult,
              email_school: email_school || null,
              email_personal: email_personal || null,
              parent_name: parent_name || null,
              parent_email: incomingParentEmail,
              ...(parentEmailChanged
                ? {
                    parent_email_is_valid: null,
                    parent_email_validated_at: null,
                    parent_email_invalid_reason: null,
                  }
                : {}),
              division: division || null,
              program_track: program_track,
              gender: gender || null,
              race: race || null,
              ethnicity: ethnicity || null,
              level_of_technology: level_of_technology || null,
              years_competing: years_competing as number | null,
            })
            .eq('id', existingId)
          if (updErr) throw updErr
          const { data: updatedRow } = await supabase
            .from('competitors')
            .select('*')
            .eq('id', existingId)
            .maybeSingle()
          if (updatedRow) {
            const newStatus = calculateCompetitorStatus(updatedRow)
            if (updatedRow.status !== newStatus) {
              await supabase
                .from('competitors')
                .update({ status: newStatus })
                .eq('id', existingId)
            }
            if (newStatus === 'profile' && !updatedRow.game_platform_id) {
              autoOnboardIds.push(updatedRow.id)
            }
          }
          updated++
          continue
        }

        const candidate = {
          coach_id: coachId,
          first_name, last_name, grade,
          is_18_or_over: isAdult,
          email_school: email_school || null,
          email_personal: email_personal || null,
          parent_name: parent_name || null,
          parent_email: parent_email || null,
          division: division || null,
          program_track: program_track,
          gender: gender || null,
          race: race || null,
          ethnicity: ethnicity || null,
          level_of_technology: level_of_technology || null,
          years_competing: years_competing as number | null,
        }

        const computedStatus = calculateCompetitorStatus(candidate)

        const { data: insertedRow, error: insErr } = await supabase
          .from('competitors')
          .insert({
            ...candidate,
            status: computedStatus,
            is_active: true,
          })
          .select('id, status, game_platform_id')
          .single()
        if (insErr) throw insErr
        if (insertedRow?.status === 'profile' && !insertedRow.game_platform_id) {
          autoOnboardIds.push(insertedRow.id)
        }
        inserted++
      } catch (e) {
        errors++
        const name = `${(raw.first_name || '').trim()} ${(raw.last_name || '').trim()}`.trim() || 'Unknown'
        const errorMsg = e instanceof Error ? e.message : 'Unknown error'
        errorDetails.push({ row: rowIndex + 1, name, error: errorMsg })
      }
    }

    // Log the bulk import operation for audit trail
    await AuditLogger.logBulkImport(supabase, {
      userId: user.id,
      coachId: user.id,
      stats: { inserted, updated, skipped, errors }
    });

    if (autoOnboardIds.length > 0) {
      try {
        await enqueueJob({
          taskType: 'game_platform_onboard_competitors',
          payload: {
            competitorIds: autoOnboardIds,
            coachId,
            onlyActive: true,
            source: 'bulk_import',
          },
        });
      } catch (enqueueError) {
        logger.error('Failed to enqueue bulk import onboarding job', {
          error: enqueueError instanceof Error ? enqueueError.message : String(enqueueError),
          count: autoOnboardIds.length,
        });
      }
    }

    return NextResponse.json({
      inserted,
      updated,
      skipped,
      duplicates,
      errors,
      total: inputRows.length,
      errorDetails: errorDetails.slice(0, 10) // Limit to first 10 errors to avoid large responses
    })
  } catch (e) {
    logger.error('Bulk import failed', { error: e instanceof Error ? e.message : 'Unknown error' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
