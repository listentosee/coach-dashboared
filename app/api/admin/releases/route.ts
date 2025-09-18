import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { calculateCompetitorStatus } from '@/lib/utils/competitor-status'

export async function GET(_req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    const isAdmin = profile?.role === 'admin'
    const coachContext = isAdmin ? (cookieStore.get('admin_coach_id')?.value || null) : null

    // Competitors: admins optionally scoped by context; coaches scoped to self
    let compQuery = supabase.from('competitors').select('*').order('first_name', { ascending: true })
    if (!isAdmin) compQuery = compQuery.eq('coach_id', user.id)
    else if (coachContext) compQuery = compQuery.eq('coach_id', coachContext)
    const { data: competitors, error: cErr } = await compQuery
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 })

    // Agreements list (unscoped; clients join with competitor_id)
    const { data: agreements, error: aErr } = await supabase.from('agreements').select('*').order('created_at', { ascending: false })
    if (aErr) return NextResponse.json({ error: aErr.message }, { status: 400 })

    // Compute derived statuses for consistency in UI filtering
    const withComputedStatus = (competitors || []).map((c: any) => ({ ...c, status: calculateCompetitorStatus(c) }))
    return NextResponse.json({ competitors: withComputedStatus, agreements: agreements || [], isAdmin })
  } catch (e) {
    console.error('Admin releases read error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
