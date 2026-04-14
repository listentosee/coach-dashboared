import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase';
import { normalizeSchoolGeo } from '@/lib/analytics/school-geo';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = await isUserAdmin(supabase, user.id);
  if (!admin) {
    throw NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return user;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch (response) {
    return response as NextResponse;
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { id } = await params;
  const schoolGeo = normalizeSchoolGeo((body as { school_geo?: unknown }).school_geo);
  const serviceSupabase = getServiceRoleSupabaseClient();

  const { data, error } = await serviceSupabase
    .from('profiles')
    .update({ school_geo: schoolGeo })
    .eq('id', id)
    .eq('role', 'coach')
    .select('id, school_geo')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Coach not found' }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    id: data.id,
    school_geo: normalizeSchoolGeo(data.school_geo),
  });
}
