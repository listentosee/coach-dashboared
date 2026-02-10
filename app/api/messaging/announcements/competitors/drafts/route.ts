import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { marked } from 'marked';
import { isUserAdmin } from '@/lib/utils/admin-check';

marked.use({ gfm: true, breaks: true });

const saveBodySchema = z.object({
  id: z.string().uuid().optional(),
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Body is required'),
});

export async function GET() {
  try {
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

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceRoleKey || !serviceUrl) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const serviceClient = createClient(serviceUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: drafts, error } = await serviceClient
      .from('competitor_announcement_campaigns')
      .select('id, subject, body_markdown, created_at')
      .eq('status', 'draft')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[competitor-announcement-drafts] Failed to list drafts', error.message);
      return NextResponse.json({ error: 'Failed to list drafts' }, { status: 500 });
    }

    return NextResponse.json({ drafts: drafts ?? [] });
  } catch (error: any) {
    console.error('[competitor-announcement-drafts] Unexpected error', error?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {

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

    const rawBody = await req.json();
    const parsed = saveBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { id, subject, body: markdownBody } = parsed.data;
    const bodyHtml = await marked.parse(markdownBody);

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceRoleKey || !serviceUrl) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const serviceClient = createClient(serviceUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    if (id) {
      const { data: draft, error } = await serviceClient
        .from('competitor_announcement_campaigns')
        .update({ subject, body_markdown: markdownBody, body_html: bodyHtml })
        .eq('id', id)
        .eq('status', 'draft')
        .select('id, subject')
        .single();

      if (error || !draft) {
        console.error('[competitor-announcement-drafts] Failed to update draft', error?.message);
        return NextResponse.json({ error: 'Failed to update draft' }, { status: 500 });
      }

      return NextResponse.json({ draft });
    }

    const { data: draft, error } = await serviceClient
      .from('competitor_announcement_campaigns')
      .insert({
        subject,
        body_markdown: markdownBody,
        body_html: bodyHtml,
        created_by: user.id,
        status: 'draft',
      })
      .select('id, subject')
      .single();

    if (error || !draft) {
      console.error('[competitor-announcement-drafts] Failed to create draft', error?.message);
      return NextResponse.json({ error: 'Failed to create draft' }, { status: 500 });
    }

    return NextResponse.json({ draft });
  } catch (error: any) {
    console.error('[competitor-announcement-drafts] Unexpected error', error?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
