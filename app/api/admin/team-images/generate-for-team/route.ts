import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase';
import { generateForTeam } from '@/lib/team-images/generate';
import { parseReferenceLogoDataUrl } from '@/lib/team-images/reference-logo';

/**
 * POST /api/admin/team-images/generate-for-team
 * Body: { teamId: uuid, instructions?: string }
 *
 * Creates a new pending candidate for a team (regardless of whether it
 * already has an image). Runs the generation inline and returns the new
 * candidate details. Used by the UI "Regen" button on complete / generated
 * teams where there is no pending candidate to supersede.
 */

const bodySchema = z.object({
  teamId: z.string().uuid(),
  instructions: z.string().max(2000).optional().default(''),
  referenceLogoDataUrl: z.string().optional(),
});

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isUserAdmin(supabase, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const service = getServiceRoleSupabaseClient();

    // Guard: if there's already a pending candidate for this team, redirect
    // the admin to use that one instead of creating a duplicate.
    const { data: existing } = await service
      .from('team_image_candidates')
      .select('id')
      .eq('team_id', parsed.data.teamId)
      .eq('status', 'pending')
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: 'A pending candidate already exists for this team — use Regen on that card.' },
        { status: 409 },
      );
    }

    const referenceLogo = parseReferenceLogoDataUrl(parsed.data.referenceLogoDataUrl);

    const result = await generateForTeam(
      {
        teamId: parsed.data.teamId,
        regenInstructions: parsed.data.instructions || undefined,
        referenceLogo,
      },
      service,
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[team-images/generate-for-team] error', {
      error: message,
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
