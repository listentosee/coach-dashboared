import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { isUserAdmin } from '@/lib/utils/admin-check'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const cookieStore = await cookies()
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = await isUserAdmin(supabase, user.id)
  if (!admin) throw NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return { user, supabase }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  let supabase
  try {
    ;({ supabase } = await requireAdmin())
  } catch (resp) {
    return resp as NextResponse
  }

  const id = params.id
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const { description, replace, fileName, contentType } = body as {
    description?: string | null
    replace?: boolean
    fileName?: string | null
    contentType?: string | null
  }

  const trimmedDescription = description?.trim()

  if (!replace && !trimmedDescription) {
    return NextResponse.json({ error: 'Provide a new description or file' }, { status: 400 })
  }

  const { data: existing, error: fetchError } = await supabase
    .from('coach_library_documents')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  let filePath = existing.file_path
  let nextFileName = existing.file_name
  let nextContentType = existing.content_type

  if (replace) {
    const trimmedName = fileName?.trim()
    if (!trimmedName) {
      return NextResponse.json({ error: 'File name is required when replacing' }, { status: 400 })
    }
    const pathName = filePath.slice(filePath.lastIndexOf('/') + 1)

    const folder = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : ''
    const { data: listed, error: listError } = await supabase.storage.from('coach-library').list(folder || undefined)
    if (listError) {
      console.error('Coach library replace list error', listError)
      return NextResponse.json({ error: 'Unable to verify uploaded file' }, { status: 400 })
    }
    const exists = listed?.some((entry) => entry.name === pathName)
    if (!exists) {
      return NextResponse.json({ error: 'Replacement file not found in storage' }, { status: 409 })
    }

    nextFileName = trimmedName
    nextContentType = contentType ?? existing.content_type ?? null
  }

  const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
  if (trimmedDescription) updateData.description = trimmedDescription
  if (replace) {
    updateData.file_name = nextFileName
    updateData.content_type = nextContentType
  }

  const { error: updateError } = await supabase
    .from('coach_library_documents')
    .update(updateData)
    .eq('id', id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  let supabase
  try {
    ;({ supabase } = await requireAdmin())
  } catch (resp) {
    return resp as NextResponse
  }

  const id = params.id
  const { data: existing, error: fetchError } = await supabase
    .from('coach_library_documents')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const { error: deleteError } = await supabase
    .from('coach_library_documents')
    .delete()
    .eq('id', id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 })
  }

  if (existing.file_path) {
    await supabase.storage.from('coach-library').remove([existing.file_path])
  }

  return NextResponse.json({ success: true })
}
