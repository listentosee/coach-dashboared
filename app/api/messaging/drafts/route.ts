import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

type DraftRow = {
  id: string
  mode: 'dm' | 'group' | 'announcement' | 'reply' | 'forward'
  body: string
  subject: string | null
  high_priority: boolean | null
  dm_recipient_id: string | null
  group_recipient_ids: string[] | null
  conversation_id: string | null
  thread_id: string | null
  updated_at: string
}

const mapDraft = (row: DraftRow) => ({
  id: row.id,
  mode: row.mode,
  body: row.body,
  subject: row.subject ?? '',
  highPriority: row.high_priority ?? false,
  dmRecipientId: row.dm_recipient_id ?? null,
  groupRecipientIds: row.group_recipient_ids ?? [],
  conversationId: row.conversation_id ?? null,
  threadId: row.thread_id ?? null,
  updatedAt: row.updated_at,
})

export async function GET() {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('message_drafts')
      .select('id, mode, body, subject, high_priority, dm_recipient_id, group_recipient_ids, conversation_id, thread_id, updated_at')
      .order('updated_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ drafts: (data || []).map(mapDraft) })
  } catch (e) {
    console.error('List drafts error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()

    const payload = {
      id: body.id ?? undefined,
      user_id: user.id,
      mode: body.mode,
      body: body.body ?? '',
      subject: body.subject ?? '',
      high_priority: body.highPriority ?? false,
      dm_recipient_id: body.dmRecipientId ?? null,
      group_recipient_ids: body.groupRecipientIds ?? [],
      conversation_id: body.conversationId ?? null,
      thread_id: body.threadId ?? null,
    }

    const { data, error } = await supabase
      .from('message_drafts')
      .upsert(payload, { onConflict: 'id' })
      .select('id, mode, body, subject, high_priority, dm_recipient_id, group_recipient_ids, conversation_id, thread_id, updated_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ draft: mapDraft(data as DraftRow) })
  } catch (e) {
    console.error('Upsert draft error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
