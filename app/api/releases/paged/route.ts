import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const isAdmin = profile?.role === 'admin'
    const url = new URL(request.url)
    const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10), 0)
    const limitParam = parseInt(url.searchParams.get('limit') ?? '40', 10)
    const limit = Math.min(Math.max(limitParam, 1), 100)
    const coachOverride = url.searchParams.get('coach_id')
    const adminContextCoach = isAdmin ? (coachOverride || cookieStore.get('admin_coach_id')?.value || null) : null

    const baseFilters = (query: any) =>
      query
        .order('first_name', { ascending: true })
        .order('last_name', { ascending: true })

    let compQuery = baseFilters(
      supabase.from('release_eligible_competitors').select('*', { count: 'exact' }),
    ).range(offset, offset + limit - 1)

    if (isAdmin) {
      if (adminContextCoach) {
        compQuery = compQuery.eq('coach_id', adminContextCoach)
      }
    } else {
      compQuery = compQuery.eq('coach_id', user.id)
    }

    const { data: competitors, error: compError, count } = await compQuery
    if (compError) {
      return NextResponse.json({ error: compError.message }, { status: 400 })
    }

    const competitorIds = (competitors || []).map((c: any) => c.id)
    let agreements: any[] = []
    if (competitorIds.length) {
      const { data: agreementRows, error: agreementError } = await supabase
        .from('agreements')
        .select('*')
        .in('competitor_id', competitorIds)
        .order('created_at', { ascending: false })

      if (agreementError) {
        return NextResponse.json({ error: agreementError.message }, { status: 400 })
      }
      agreements = agreementRows || []
    }

    let summary: {
      total: number
      notSent: number
      sent: number
      complete: number
      manual: number
    } | null = null

    if (offset === 0) {
      const summaryQuery = baseFilters(
        supabase.from('release_eligible_competitors').select(
          'id, coach_id, is_18_or_over, participation_agreement_date, media_release_date',
        ),
      )

      const summaryScoped = isAdmin
        ? adminContextCoach
          ? summaryQuery.eq('coach_id', adminContextCoach)
          : summaryQuery
        : summaryQuery.eq('coach_id', user.id)

      const { data: allCompetitors, error: summaryError } = await summaryScoped
      if (summaryError) {
        return NextResponse.json({ error: summaryError.message }, { status: 400 })
      }

      const allIds = (allCompetitors || []).map((c: any) => c.id)
      let summaryAgreements: any[] = []
      if (allIds.length) {
        const { data: allAgreementRows, error: allAgreementError } = await supabase
          .from('agreements')
          .select('*')
          .in('competitor_id', allIds)
          .order('created_at', { ascending: false })

        if (allAgreementError) {
          return NextResponse.json({ error: allAgreementError.message }, { status: 400 })
        }
        summaryAgreements = allAgreementRows || []
      }

      const agreementMap = new Map<string, any>()
      for (const agreement of summaryAgreements) {
        if (!agreementMap.has(agreement.competitor_id)) {
          agreementMap.set(agreement.competitor_id, agreement)
        }
      }

      const totals = {
        total: allCompetitors?.length ?? 0,
        notSent: 0,
        sent: 0,
        complete: 0,
        manual: 0,
      }

      for (const competitor of allCompetitors || []) {
        const agreement = agreementMap.get(competitor.id) || null
        const hasLegacy = competitor.is_18_or_over
          ? !!competitor.participation_agreement_date
          : !!competitor.media_release_date

        if (agreement?.status === 'completed') {
          totals.complete += 1
          continue
        }

        if (agreement?.status === 'completed_manual') {
          totals.manual += 1
          continue
        }

        if (hasLegacy) {
          totals.manual += 1
          continue
        }

        if (agreement) {
          totals.sent += 1
          continue
        }

        totals.notSent += 1
      }

      summary = totals
    }

    return NextResponse.json({
      competitors: competitors || [],
      agreements,
      total: count ?? (competitors?.length ?? 0),
      offset,
      limit,
      isAdmin,
      coachContext: adminContextCoach,
      summary,
    })
  } catch (error) {
    console.error('Releases paged read error', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
