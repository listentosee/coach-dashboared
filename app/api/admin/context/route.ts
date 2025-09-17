import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'admin_coach_id'

async function assertAdmin(supabase: ReturnType<typeof createRouteHandlerClient>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, status: 401, error: 'Unauthorized' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { ok: false as const, status: 403, error: 'Forbidden' }
  return { ok: true as const, user }
}

export async function GET(_req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const admin = await assertAdmin(supabase)
    if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status })

    const coachId = cookieStore.get(COOKIE_NAME)?.value || null

    let coachName: string | undefined
    if (coachId) {
      const { data: coach } = await supabase
        .from('profiles')
        .select('first_name,last_name,email')
        .eq('id', coachId)
        .single()
      if (coach) {
        const name = `${coach.first_name || ''} ${coach.last_name || ''}`.trim()
        coachName = name || coach.email || undefined
      }
    }

    return NextResponse.json({ coach_id: coachId, coach_name: coachName ?? null })
  } catch (e) {
    console.error('Admin context GET error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const admin = await assertAdmin(supabase)
    if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status })

    const body = await req.json().catch(() => ({})) as { coach_id?: string | null }
    const coachId = body.coach_id ?? null

    const res = NextResponse.json({ ok: true, coach_id: coachId })

    if (coachId) {
      // Validate coach exists
      const { data: coach } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, role')
        .eq('id', coachId)
        .single()
      if (!coach || (coach.role !== 'coach' && coach.role !== 'admin' && coach.role !== 'gm')) {
        return NextResponse.json({ error: 'Coach not found' }, { status: 404 })
      }
      res.cookies.set(COOKIE_NAME, coachId, { httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production' })
    } else {
      res.cookies.set(COOKIE_NAME, '', { httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production', maxAge: 0 })
    }

    return res
  } catch (e) {
    console.error('Admin context POST error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
