import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import CoachAssistTool from '@/components/dashboard/coach-assist-tool';

export default async function AdminToolsPage() {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient({ cookies: () => cookieStore });
  
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

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Admin Tools</h1>
        <p className="text-gray-600 mt-2">
          System administration and management tools
        </p>
      </div>

      <div className="space-y-8">
        <div className="bg-white border rounded p-4">
          <h2 className="text-xl font-semibold mb-2">Analytics</h2>
          <p className="text-gray-600 mb-4">View program-wide metrics and status breakdowns.</p>
          <a href="/dashboard/admin-tools/analytics" className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Open Analytics Dashboard</a>
        </div>

        <div className="bg-white border rounded p-4">
          <h2 className="text-xl font-semibold mb-2">Job Processor</h2>
          <p className="text-gray-600 mb-4">Monitor queued sync jobs and run manual retries.</p>
          <a href="/dashboard/admin-tools/jobs" className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">View Job Queue</a>
        </div>

        <CoachAssistTool />

        {/* Add other admin tools here */}
      </div>
    </div>
  );
}
