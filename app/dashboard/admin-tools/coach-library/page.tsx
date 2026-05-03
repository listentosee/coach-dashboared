import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { CoachLibraryManager } from '@/components/dashboard/admin/CoachLibraryManager'

export default async function CoachLibraryAdminPage() {
  const supabase = createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/auth/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    redirect('/dashboard')
  }

  return (
    <div className="container mx-auto py-6 px-6">
      <CoachLibraryManager />
    </div>
  )
}
