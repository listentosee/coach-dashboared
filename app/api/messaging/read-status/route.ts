import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { isUserAdmin } from '@/lib/utils/admin-check'

function formatDisplayName(profile: any) {
  const fullName = typeof profile?.full_name === 'string' ? profile.full_name.trim() : ''
  if (fullName) return fullName
  const first = typeof profile?.first_name === 'string' ? profile.first_name.trim() : ''
  const last = typeof profile?.last_name === 'string' ? profile.last_name.trim() : ''
  const combined = [first, last].filter(Boolean).join(' ').trim()
  if (combined) return combined
  return profile?.email ?? 'Unknown'
}

// GET /api/messaging/read-status?messageId=123
export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const messageId = req.nextUrl.searchParams.get('messageId')?.trim()
    if (!messageId) {
      return NextResponse.json({ error: 'messageId required' }, { status: 400 })
    }

    const { data: message, error: messageError } = await supabase
      .from('messages')
      .select('id, conversation_id')
      .eq('id', messageId)
      .maybeSingle()

    if (messageError || !message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    const { data: membership, error: membershipError } = await supabase
      .from('conversation_members')
      .select('user_id')
      .eq('conversation_id', message.conversation_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (membershipError || !membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const isAdmin = await isUserAdmin(supabase, user.id)
    const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const readerClient = (isAdmin && serviceUrl && serviceKey)
      ? createClient(serviceUrl, serviceKey, { auth: { persistSession: false } })
      : supabase

    const { data: receipts, error: receiptsError } = await readerClient
      .from('message_read_receipts')
      .select('user_id, read_at, profiles(id, first_name, last_name, full_name, email)')
      .eq('message_id', messageId)
      .order('read_at', { ascending: false })

    if (receiptsError) {
      return NextResponse.json({ error: receiptsError.message }, { status: 400 })
    }

    const seen = (receipts || [])
      .map((row: any) => formatDisplayName(row.profiles))
      .filter((name: string) => !!name)

    return NextResponse.json({ seen })
  } catch (e) {
    console.error('Read status GET error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
