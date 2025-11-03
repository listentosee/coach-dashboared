import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: rows, error } = await supabase
      .from('coach_library_documents')
      .select('*')
      .order('updated_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const documents = await Promise.all((rows || []).map(async (row) => {
      let downloadUrl: string | null = null
      if (row.file_path) {
        const { data: signed } = await supabase
          .storage
          .from('coach-library')
          .createSignedUrl(row.file_path, 3600)
        downloadUrl = signed?.signedUrl ?? null
      }
      return {
        id: row.id,
        description: row.description,
        file_name: row.file_name,
        content_type: row.content_type,
        file_path: row.file_path,
        downloadUrl,
        updated_at: row.updated_at,
      }
    }))

    return NextResponse.json({ documents })
  } catch (error) {
    console.error('Coach library fetch error', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
