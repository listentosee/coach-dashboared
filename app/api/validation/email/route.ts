import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServiceRoleSupabaseClient } from '@/lib/supabase/server';
import { assertEmailsUnique, EmailConflictError } from '@/lib/validation/email-uniqueness';

const PayloadSchema = z.object({
  emails: z.array(z.string().min(1)).min(1),
  ignoreProfileIds: z.array(z.string().uuid()).optional(),
  ignoreCompetitorIds: z.array(z.string().uuid()).optional(),
  coachScopeId: z.string().uuid().optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = PayloadSchema.parse(body);

    await assertEmailsUnique({
      supabase: getServiceRoleSupabaseClient(),
      emails: payload.emails,
      ignoreProfileIds: payload.ignoreProfileIds,
      ignoreCompetitorIds: payload.ignoreCompetitorIds,
      coachScopeId: payload.coachScopeId ?? null,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error instanceof EmailConflictError) {
      return NextResponse.json(
        { error: 'Email already in use', details: error.details },
        { status: 409 },
      );
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid payload', issues: error.issues }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to validate email uniqueness', details: error?.message ?? 'Unknown error' },
      { status: 500 },
    );
  }
}
