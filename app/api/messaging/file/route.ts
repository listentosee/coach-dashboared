import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// Streams a private Storage object from bucket 'message' to authenticated users (no signed URL).
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const path = url.searchParams.get('path')
    if (!path) return NextResponse.json({ error: 'Missing path' }, { status: 400 })

    const { data: blob, error } = await supabase.storage.from('message').download(path)
    if (error || !blob) return NextResponse.json({ error: error?.message || 'Not found' }, { status: 404 })

    const arr = await blob.arrayBuffer()
    return new NextResponse(Buffer.from(arr), {
      status: 200,
      headers: {
        'Content-Type': blob.type || 'application/octet-stream',
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    console.error('File stream error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
