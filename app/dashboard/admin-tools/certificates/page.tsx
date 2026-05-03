import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { CertificatesDashboardClient } from '@/components/dashboard/admin/certificates-dashboard-client';

export const dynamic = 'force-dynamic';

export default async function CertificatesAdminPage() {
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
    <div className="container mx-auto space-y-6 px-4 py-6">
      <div>
        <h1 className="text-3xl font-bold text-meta-light">Certificates</h1>
        <p className="mt-2 text-meta-muted">
          Generate certificate PDFs, dry-run email audiences, and hold the live send until the actual send day.
        </p>
      </div>

      <CertificatesDashboardClient />
    </div>
  );
}
