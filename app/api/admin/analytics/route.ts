import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const coachId = url.searchParams.get('coach_id') || undefined
    const supabase = createRouteHandlerClient({ cookies })

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Ensure admin
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Coaches list
    const { data: coaches } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'coach')
      .order('full_name')

    // Helper to count competitors by optional filters
    const countCompetitors = async (filters: Record<string, any>) => {
      let q = supabase.from('competitors').select('id', { count: 'exact', head: true })
      for (const [k, v] of Object.entries(filters)) q = (q as any).eq(k, v)
      const { count } = await q
      return count || 0
    }

    const coachFilter = coachId ? { coach_id: coachId } : {}

    // Totals
    const [{ count: coachCount }, competitorTotal, { count: teamCount }] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'coach'),
      (async () => countCompetitors(coachFilter))(),
      (async () => {
        let t = supabase.from('teams').select('id', { count: 'exact', head: true })
        if (coachId) t = t.eq('coach_id', coachId)
        const { count } = await t
        return { count: count || 0 }
      })()
    ])

    // Status breakdown
    const statuses = ['pending','profile','compliance','complete'] as const
    const statusCounts: Record<string, number> = {}
    for (const s of statuses) {
      statusCounts[s] = await countCompetitors({ ...coachFilter, status: s })
    }

    // Releases
    // Complete: dates present
    let compQ = supabase.from('competitors').select('id', { count: 'exact', head: true })
      .or('participation_agreement_date.not.is.null,media_release_date.not.is.null')
    if (coachId) compQ = compQ.eq('coach_id', coachId)
    const { count: completeRelease } = await compQ

    // Sent: agreements exist but not completed; optionally filter by coach via competitor_ids
    let competitorIds: string[] | undefined = undefined
    if (coachId) {
      const { data: idRows } = await supabase.from('competitors').select('id').eq('coach_id', coachId)
      competitorIds = (idRows || []).map(r => r.id)
    }
    let aQ = supabase.from('agreements').select('competitor_id, manual_completed_at, zoho_completed')
    if (competitorIds && competitorIds.length > 0) aQ = aQ.in('competitor_id', competitorIds)
    const { data: aRows } = await aQ
    const sentIds = new Set((aRows || []).filter(a => !a.manual_completed_at && !(a as any).zoho_completed).map(a => a.competitor_id))
    let sentCount = 0
    if (sentIds.size > 0) {
      let sc = supabase.from('competitors').select('id', { count: 'exact', head: true }).in('id', Array.from(sentIds))
      if (coachId) sc = sc.eq('coach_id', coachId)
      const { count } = await sc
      sentCount = count || 0
    }
    const notStarted = (competitorTotal || 0) - (completeRelease || 0) - (sentCount || 0)

    return NextResponse.json({
      coaches: coaches || [],
      totals: {
        coachCount: (coachCount || 0),
        competitorCount: competitorTotal || 0,
        teamCount: teamCount || 0,
      },
      statusCounts,
      releases: {
        notStarted: notStarted < 0 ? 0 : notStarted,
        sent: sentCount,
        complete: completeRelease || 0,
      }
    })
  } catch (e) {
    console.error('admin analytics error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

