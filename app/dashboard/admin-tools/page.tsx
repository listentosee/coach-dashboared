import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import CoachAssistTool from '@/components/dashboard/coach-assist-tool';

export default async function AdminToolsPage() {
  const supabase = createServerComponentClient({ cookies });
  
  // Check if user is authenticated
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    redirect('/auth/login');
  }

  // Check if user is an admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    redirect('/dashboard');
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Admin Tools</h1>
        <p className="text-gray-600 mt-2">
          System administration and management tools
        </p>
      </div>

      <div className="space-y-8">
        <CoachAssistTool />
        
        {/* Add other admin tools here */}
      </div>
    </div>
  );
}
