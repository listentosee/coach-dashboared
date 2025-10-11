import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
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

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: 'Server configuration missing Supabase credentials' },
        { status: 500 },
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    await assertEmailsUnique({
      supabase,
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
