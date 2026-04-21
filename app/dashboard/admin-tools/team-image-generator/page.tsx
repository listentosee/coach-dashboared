import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { TeamImageGeneratorClient } from './team-image-generator-client';

export const dynamic = 'force-dynamic';

export default async function TeamImageGeneratorPage() {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient({ cookies: () => cookieStore });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') redirect('/dashboard');

  return (
    <div className="container mx-auto py-6 px-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-meta-light">Team Image Generator</h1>
        <p className="text-meta-muted mt-2">
          AI-generate team images for teams without a photo. Review and accept, regenerate, or reject each candidate.
        </p>
      </div>
      <TeamImageGeneratorClient />
    </div>
  );
}
