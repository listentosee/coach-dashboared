import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';

export default async function AdminToolsPage() {
  const supabase = createServerClient();
  
  // Check if user is authenticated (verified by Supabase Auth)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/auth/login');
  }

  // Check if user is an admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    redirect('/dashboard');
  }

  redirect('/dashboard/admin-tools/analytics');
}
