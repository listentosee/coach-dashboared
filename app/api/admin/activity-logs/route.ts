import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const url = new URL(req.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
    const perPage = Math.min(200, Math.max(1, parseInt(url.searchParams.get('perPage') || '50', 10)))
    const action = url.searchParams.get('action') || ''
    const dateFrom = url.searchParams.get('dateFrom') || ''
    const dateTo = url.searchParams.get('dateTo') || ''
    const entityType = url.searchParams.get('entityType') || ''

    const serviceClient = getServiceRoleSupabaseClient()
    const from = (page - 1) * perPage
    const to = from + perPage - 1

    let query = serviceClient
      .from('activity_logs')
      .select('*, profiles!activity_logs_user_id_fkey(email)', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (action) {
      const actions = action.split(',').map(a => a.trim()).filter(Boolean)
      if (actions.length === 1) {
        query = query.eq('action', actions[0])
      } else if (actions.length > 1) {
        query = query.in('action', actions)
      }
    }

    if (dateFrom) {
      query = query.gte('created_at', dateFrom)
    }
    if (dateTo) {
      // Add end of day to include the full date
      query = query.lte('created_at', dateTo + 'T23:59:59.999Z')
    }
    if (entityType) {
      query = query.eq('entity_type', entityType)
    }

    query = query.range(from, to)

    const { data, count, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const logs = (data || []).map((row: any) => ({
      id: row.id,
      user_id: row.user_id,
      action: row.action,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      metadata: row.metadata,
      ip_address: row.ip_address,
      created_at: row.created_at,
      user_email: row.profiles?.email || null,
    }))

    return NextResponse.json({
      logs,
      total: count ?? 0,
      page,
      perPage,
    })
  } catch (e) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
