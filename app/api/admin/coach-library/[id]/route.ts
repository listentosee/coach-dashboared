import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
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

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin()
  } catch (resp) {
    return resp as NextResponse
  }

  const id = params.id
  const form = await req.formData()
  const description = (form.get('description') as string | null)?.trim()
  const file = form.get('file') as File | null

  if (!description && !file) {
    return NextResponse.json({ error: 'Provide a new description or file' }, { status: 400 })
  }

  const service = serviceClient()
  const { data: existing, error: fetchError } = await service
    .from('coach_library_documents')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  let filePath = existing.file_path
  let fileName = existing.file_name
  let contentType = existing.content_type

  if (file) {
    const { error: uploadError } = await service
      .storage
      .from('coach-library')
      .upload(filePath, file, { upsert: true })
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 400 })
    }
    fileName = file.name
    contentType = file.type || null
  }

  const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
  if (description) updateData.description = description
  if (file) {
    updateData.file_name = fileName
    updateData.content_type = contentType
  }

  const { error: updateError } = await service
    .from('coach_library_documents')
    .update(updateData)
    .eq('id', id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin()
  } catch (resp) {
    return resp as NextResponse
  }

  const id = params.id
  const service = serviceClient()
  const { data: existing, error: fetchError } = await service
    .from('coach_library_documents')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const { error: deleteError } = await service
    .from('coach_library_documents')
    .delete()
    .eq('id', id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 })
  }

  if (existing.file_path) {
    await service.storage.from('coach-library').remove([existing.file_path])
  }

  return NextResponse.json({ success: true })
}
