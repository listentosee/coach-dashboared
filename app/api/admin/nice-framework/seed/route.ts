import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';

interface NiceFrameworkElement {
  element_identifier: string;
  title: string;
  text: string;
  doc_identifier: string;
}

interface NiceFrameworkData {
  elements: NiceFrameworkElement[];
}

export async function POST() {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  // Check authentication and admin role using regular client
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  // Use service role client for admin operations (bypasses RLS)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Fetch NIST NICE Framework data
    const nistResponse = await fetch(
      'https://csrc.nist.gov/csrc/media/Projects/cprt/documents/nice/v2_nf_components.json',
      { cache: 'no-store' }
    );

    if (!nistResponse.ok) {
      throw new Error(`Failed to fetch NIST data: ${nistResponse.statusText}`);
    }

    const nistData: NiceFrameworkData = await nistResponse.json();

    // Filter for work roles (elements with '-WRL-' in identifier)
    const workRoles = nistData.elements
      .filter((element) => element.element_identifier.includes('-WRL-'))
      .map((element) => {
        const category = element.element_identifier.split('-')[0];
        return {
          work_role_id: element.element_identifier,
          title: element.title,
          description: element.text,
          category,
        };
      });

    if (workRoles.length === 0) {
      throw new Error('No work roles found in NIST data');
    }

    // Upsert work roles into database using service role (bypasses RLS)
    const { error: upsertError } = await supabaseAdmin
      .from('nice_framework_work_roles')
      .upsert(workRoles, {
        onConflict: 'work_role_id',
      });

    if (upsertError) {
      throw new Error(`Database error: ${upsertError.message}`);
    }

    return NextResponse.json({
      success: true,
      count: workRoles.length,
      message: `Successfully loaded ${workRoles.length} NICE work roles`,
    });
  } catch (error) {
    console.error('[nice-framework-seed] Failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to seed NICE Framework data' },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
