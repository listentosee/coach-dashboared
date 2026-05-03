import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import CoachAssistTool from '@/components/dashboard/coach-assist-tool';

export default async function AssistCoachPage() {
  const supabase = createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/auth/login');
  }

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
        <h1 className="text-3xl font-bold text-gray-900">Assist Coach</h1>
        <p className="text-gray-600 mt-2">
          Generate temporary passwords to get coaches back into their accounts quickly.
        </p>
      </div>

      <CoachAssistTool />
    </div>
  );
}
