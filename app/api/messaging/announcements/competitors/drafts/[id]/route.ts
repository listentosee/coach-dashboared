import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { isUserAdmin } from '@/lib/utils/admin-check';

function getServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceRoleKey || !serviceUrl) return null;
  return createClient(serviceUrl, serviceRoleKey, { auth: { persistSession: false } });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (process.env.NEXT_PUBLIC_COMPETITOR_ANNOUNCEMENTS_ENABLED !== 'true') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { id } = await params;

    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isAdmin = await isUserAdmin(supabase, user.id);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const serviceClient = getServiceClient();
    if (!serviceClient) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const { data: draft, error } = await serviceClient
      .from('competitor_announcement_campaigns')
      .select('id, subject, body_markdown')
      .eq('id', id)
      .eq('status', 'draft')
      .single();

    if (error || !draft) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
    }

    return NextResponse.json({ draft });
  } catch (error: any) {
    console.error('[competitor-announcement-drafts] Unexpected error', error?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (process.env.NEXT_PUBLIC_COMPETITOR_ANNOUNCEMENTS_ENABLED !== 'true') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { id } = await params;

    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isAdmin = await isUserAdmin(supabase, user.id);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const serviceClient = getServiceClient();
    if (!serviceClient) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const { error } = await serviceClient
      .from('competitor_announcement_campaigns')
      .delete()
      .eq('id', id)
      .eq('status', 'draft');

    if (error) {
      console.error('[competitor-announcement-drafts] Failed to delete draft', error.message);
      return NextResponse.json({ error: 'Failed to delete draft' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[competitor-announcement-drafts] Unexpected error', error?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
