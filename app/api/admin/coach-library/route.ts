import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { isUserAdmin } from '@/lib/utils/admin-check'

export const dynamic = 'force-dynamic'

const BUCKET = 'coach-library'

function sanitizeFileName(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return 'file'
  const [base, ...extParts] = trimmed.split('.')
  const extension = extParts.length > 0 ? extParts.pop()! : ''
  const safeBase = base
    .replace(/[/\\]+/g, ' ')
    .replace(/[^\w\s.-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 120) || 'file'
  const safeExt = extension
    .replace(/[/\\]+/g, '')
    .replace(/[^\w-]/g, '')
    .slice(0, 30)
  return safeExt ? `${safeBase}.${safeExt}` : safeBase
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = await isUserAdmin(supabase, user.id)
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const { phase } = body as { phase?: string }
    if (phase === 'prepare') {
      const { fileName, contentType, description } = body as {
        fileName?: string
        contentType?: string
        description?: string
      }
      if (!fileName || !description?.trim()) {
        return NextResponse.json({ error: 'File name and description are required' }, { status: 400 })
      }

      const safeName = sanitizeFileName(fileName)
      const path = `library/${crypto.randomUUID()}/${safeName}`

      return NextResponse.json({
        path,
        contentType: contentType || null,
        sanitizedFileName: safeName,
      })
    }

    if (phase === 'finalize') {
      const { path, description, fileName, contentType } = body as {
        path?: string
        description?: string
        fileName?: string
        contentType?: string | null
      }

      if (!path || !description?.trim() || !fileName) {
        return NextResponse.json({ error: 'Path, file name, and description are required' }, { status: 400 })
      }

      const trimmedName = fileName.trim()
      const safeName = sanitizeFileName(trimmedName)
      if (!path.endsWith(`/${safeName}`)) {
        return NextResponse.json({ error: 'File name does not match prepared path' }, { status: 400 })
      }

      const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
      const targetName = path.slice(path.lastIndexOf('/') + 1)

      const { data: listed, error: listError } = await supabase.storage
        .from(BUCKET)
        .list(folder || undefined)

      if (listError) {
        console.error('Coach library finalize list error', listError)
        return NextResponse.json({ error: 'Unable to verify upload' }, { status: 400 })
      }

      const exists = listed?.some((entry) => entry.name === targetName)
      if (!exists) {
        return NextResponse.json({ error: 'Uploaded file not found' }, { status: 409 })
      }

      const { data, error: insertError } = await supabase
        .from('coach_library_documents')
        .insert({
          file_path: path,
          file_name: trimmedName,
          content_type: contentType || null,
          description: description.trim(),
        })
        .select()
        .single()

      if (insertError) {
        console.error('Coach library finalize insert error', insertError)
        await supabase.storage.from(BUCKET).remove([path]).catch((removeErr) => {
          console.error('Coach library cleanup error', removeErr)
        })
        return NextResponse.json({ error: insertError.message }, { status: 400 })
      }

      return NextResponse.json({ success: true, document: data })
    }

    return NextResponse.json({ error: 'Unsupported phase' }, { status: 400 })
  } catch (error) {
    console.error('Coach library create error', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
