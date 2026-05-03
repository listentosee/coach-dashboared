import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { SchoolGeoManager } from '@/components/dashboard/admin/school-geo-manager';
import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase';
import { normalizeSchoolGeo } from '@/lib/analytics/school-geo';

export const dynamic = 'force-dynamic';

export default async function SchoolGeoAdminPage() {
  const supabase = createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/auth/login');
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || profile.role !== 'admin') {
    redirect('/dashboard');
  }

  const serviceSupabase = getServiceRoleSupabaseClient();
  const { data: rows, error } = await serviceSupabase
    .from('profiles')
    .select('id, full_name, email, school_name, monday_coach_id, school_geo')
    .eq('role', 'coach')
    .order('full_name');

  if (error) {
    throw new Error(error.message);
  }

  const normalizedRows = (rows || []).map((row) => ({
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    school_name: row.school_name,
    monday_coach_id: row.monday_coach_id,
    school_geo: normalizeSchoolGeo(row.school_geo),
  }));

  return (
    <div className="container mx-auto space-y-6 px-4 py-6">
      <div>
        <h1 className="text-3xl font-bold text-meta-light">School Geo</h1>
        <p className="mt-2 text-meta-muted">
          Audit and edit the stored coach address payloads that drive the analytics map.
        </p>
      </div>

      <SchoolGeoManager rows={normalizedRows} />
    </div>
  );
}
