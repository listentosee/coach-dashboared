import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { z } from 'zod';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { createAnalyticsShareLink } from '@/lib/analytics/share-links';

const requestBodySchema = z.object({
  expiresInDays: z.number().int().min(1).max(365).optional(),
  maxUses: z.number().int().min(1).max(500).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = await isUserAdmin(supabase, user.id);
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsed = requestBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const result = await createAnalyticsShareLink({
      createdBy: user.id,
      expiresInDays: parsed.data.expiresInDays,
      maxUses: parsed.data.maxUses,
    });

    return NextResponse.json({
      ok: true,
      link: result.link,
      url: result.url,
    });
  } catch (error) {
    console.error('Create analytics share link error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
