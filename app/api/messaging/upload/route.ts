import { NextRequest, NextResponse } from 'next/server'
import { Buffer } from 'node:buffer'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// Upload attachments to Supabase Storage bucket 'messages' and return a public URL.
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const arrayBuffer = await file.arrayBuffer()
    // Store using the original file name under the user's folder; overwrite existing via upsert
    const filePath = `${session.user.id}/${file.name}`

    const { error: upErr } = await supabase.storage.from('message').upload(filePath, Buffer.from(arrayBuffer), {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
      cacheControl: '3600',
    })
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 })

    // Return the storage path (RLS-protected). Clients should use the /api/messaging/file endpoint to access.
    return NextResponse.json({ path: filePath, name: file.name, contentType: file.type })
  } catch (e) {
    console.error('Upload error', e)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
