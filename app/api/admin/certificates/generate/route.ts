import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { z } from 'zod';
import { isUserAdmin } from '@/lib/utils/admin-check';
import {
  resolveEligibleCompetitors,
  uploadCertificatePdf,
  upsertCertificateRecord,
} from '@/lib/certificates/generate';

const requestBodySchema = z.object({
  certificateYear: z.number().int().optional(),
  competitorIds: z.array(z.string().uuid()).optional(),
  dryRun: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isAdmin = await isUserAdmin(supabase, user.id);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsed = requestBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { certificateYear, competitorIds, dryRun } = parsed.data;
    const competitors = await resolveEligibleCompetitors({ competitorIds });

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        count: competitors.length,
        competitors: competitors.map((competitor) => ({
          id: competitor.id,
          name: `${competitor.first_name} ${competitor.last_name}`.trim(),
          studentId: competitor.game_platform_id || competitor.id,
        })),
      });
    }

    const results = [];
    for (const competitor of competitors) {
      const uploaded = await uploadCertificatePdf({ competitor, certificateYear });
      const record = await upsertCertificateRecord({
        competitorId: competitor.id,
        studentId: uploaded.studentId,
        certificateYear: uploaded.certificateYear,
        storagePath: uploaded.storagePath,
      });

      results.push({
        competitorId: competitor.id,
        competitorName: uploaded.fullName,
        certificateId: record.id,
        storagePath: uploaded.storagePath,
      });
    }

    return NextResponse.json({
      ok: true,
      generated: results.length,
      results,
    });
  } catch (error) {
    console.error('Certificate generation failed', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
