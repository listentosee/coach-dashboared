import { Buffer } from 'node:buffer'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function decodeFileName(name: string | null | undefined) {
  if (!name) return 'document'
  try {
    return decodeURIComponent(name)
  } catch {
    return name
  }
}

function contentDisposition(filename: string) {
  const safe = filename.replace(/["\r\n]/g, '').trim() || 'document'
  const ascii = safe.replace(/[^\x20-\x7E]+/g, '')
  const fallback = ascii || 'document'
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(safe)}`
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const cookieStore = cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: document, error: documentError } = await supabase
      .from('coach_library_documents')
      .select('id, description, file_path, file_name, content_type')
      .eq('id', params.id)
      .single()

    if (documentError || !document?.file_path) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: fileData, error: downloadError } = await service
      .storage
      .from('coach-library')
      .download(document.file_path)

    if (downloadError || !fileData) {
      return NextResponse.json({ error: downloadError?.message || 'File unavailable' }, { status: 404 })
    }

    const buffer = Buffer.from(await fileData.arrayBuffer())
    const filename = decodeFileName(document.file_name)

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': document.content_type || 'application/octet-stream',
        'Content-Length': buffer.byteLength.toString(),
        'Content-Disposition': contentDisposition(filename),
        'Cache-Control': 'private, max-age=60',
      },
    })
  } catch (error) {
    console.error('Coach library download error', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
