import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { z } from 'zod';
import { isUserAdmin } from '@/lib/utils/admin-check';
import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase';
import { generateForTeam } from '@/lib/team-images/generate';

const bodySchema = z.object({
  instructions: z.string().max(2000).optional().default(''),
});

// Gemini image generation can take 15–45 seconds. Allow up to 60s.
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const { candidateId } = await params;

    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

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

    const { data: candidate, error: cErr } = await service
      .from('team_image_candidates')
      .select('id, team_id, status')
      .eq('id', candidateId)
      .single();

    if (cErr || !candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }
    if (candidate.status !== 'pending') {
      return NextResponse.json({ error: `Candidate already ${candidate.status}` }, { status: 409 });
    }

    // Inline generation — blocks until Gemini returns and the file is uploaded.
    const result = await generateForTeam(
      {
        teamId: candidate.team_id,
        regenInstructions: parsed.data.instructions || undefined,
        supersedesCandidateId: candidate.id,
      },
      service,
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[team-images/regen] error', { error: message, stack: err instanceof Error ? err.stack : undefined });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
