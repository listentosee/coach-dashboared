import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { isUserAdmin } from '@/lib/utils/admin-check';
import {
  buildAnalyticsShareUrlFromBase,
  createAnalyticsShareLink,
} from '@/lib/analytics/share-links';

const requestBodySchema = z.object({
  expiresInDays: z.number().int().min(1).max(365).optional(),
  maxUses: z.number().int().min(1).max(500).optional(),
});

function resolvePublicBaseUrl(req: NextRequest) {
  const forwardedHost = req.headers.get('x-forwarded-host');
  const forwardedProto = req.headers.get('x-forwarded-proto');

  if (forwardedHost) {
    return `${forwardedProto || 'https'}://${forwardedHost}`.replace(/\/$/, '');
  }

  const host = req.headers.get('host');
  if (host) {
    return `${req.nextUrl.protocol}//${host}`.replace(/\/$/, '');
  }

  return (process.env.NEXT_PUBLIC_APP_URL || 'https://coach.cyber-guild.org').replace(/\/$/, '');
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient();
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
    const publicBaseUrl = resolvePublicBaseUrl(req);

    return NextResponse.json({
      ok: true,
      link: result.link,
      url: buildAnalyticsShareUrlFromBase(publicBaseUrl, result.link.token),
    });
  } catch (error) {
    console.error('Create analytics share link error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
