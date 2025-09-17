import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { isUserAdmin } from '@/lib/utils/admin-check'
import { calculateCompetitorStatus } from '@/lib/utils/competitor-status'

// Admin-only, server-paginated competitors listing with latest agreement info
export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const isAdmin = await isUserAdmin(supabase, user.id)
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const url = new URL(req.url)
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0)
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '40', 10), 1), 200)
    const coachId = url.searchParams.get('coach_id')

    // Base total count
    let totalQuery = supabase.from('competitors').select('id', { count: 'exact', head: true })
    let dataQuery = supabase
      .from('competitors')
      .select(`
        id, first_name, last_name, email_personal, email_school,
        is_18_or_over, grade, division, parent_email,
        gender, race, ethnicity, level_of_technology, years_competing,
        status, media_release_date, participation_agreement_date,
        game_platform_id, game_platform_synced_at,
        profile_update_token, profile_update_token_expires,
        created_at, is_active, coach_id
      `)
      .order('last_name', { ascending: true })
      .range(offset, offset + limit - 1)

    if (coachId) {
      totalQuery = totalQuery.eq('coach_id', coachId)
      dataQuery = dataQuery.eq('coach_id', coachId)
    }

    const { count: total, error: countErr } = await totalQuery
    if (countErr) return NextResponse.json({ error: countErr.message }, { status: 400 })

    const { data: rows, error: rowsErr } = await dataQuery
    if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 400 })

    const ids = (rows || []).map(r => r.id)
    let latestAgreements: any[] = []
    if (ids.length) {
      const { data: aggs } = await supabase
        .from('agreements')
        .select('competitor_id, status, metadata, created_at')
        .in('competitor_id', ids)
        .order('created_at', { ascending: false })
      latestAgreements = aggs || []
    }

    const mapped = (rows || []).map((c: any) => {
      const status = calculateCompetitorStatus(c)
      const latest = latestAgreements.find(a => a.competitor_id === c.id) || null
      return {
        ...c,
        status,
        agreement_status: latest?.status || null,
        agreement_mode: latest?.metadata?.mode || null,
      }
    })

    return NextResponse.json({ rows: mapped, total: total || 0, offset, limit })
  } catch (e) {
    console.error('Admin paged competitors error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

