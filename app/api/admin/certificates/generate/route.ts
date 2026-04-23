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
import { AuditLogger } from '@/lib/audit/audit-logger';
import { getServiceRoleSupabaseClient } from '@/lib/jobs/supabase';

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
    const service = getServiceRoleSupabaseClient();
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

      await AuditLogger.logAction(service, {
        user_id: user.id,
        action: 'certificate_generated',
        entity_type: 'competitor_certificate',
        entity_id: record.id,
        metadata: {
          competitor_id: competitor.id,
          certificate_year: uploaded.certificateYear,
          storage_path: uploaded.storagePath,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      generated: results.length,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error('[certificates/generate] 500', { message, stack });
    return NextResponse.json({ error: message, stack: process.env.NODE_ENV === 'production' ? undefined : stack }, { status: 500 });
  }
}
