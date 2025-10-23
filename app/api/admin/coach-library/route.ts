import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
import { isUserAdmin } from '@/lib/utils/admin-check'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = await isUserAdmin(supabase, user.id)
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const form = await req.formData()
    const file = form.get('file') as File | null
    const description = (form.get('description') as string | null)?.trim()

    if (!file || !description) {
      return NextResponse.json({ error: 'File and description are required' }, { status: 400 })
    }

    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const path = `${crypto.randomUUID()}-${file.name}`
    const { error: uploadError } = await service
      .storage
      .from('coach-library')
      .upload(path, file, { upsert: false })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 400 })
    }

    const { error: insertError } = await service
      .from('coach_library_documents')
      .insert({
        file_path: path,
        file_name: file.name,
        content_type: file.type || null,
        description,
      })

    if (insertError) {
      // Roll back storage upload if metadata insert fails
      await service.storage.from('coach-library').remove([path])
      return NextResponse.json({ error: insertError.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Coach library create error', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
