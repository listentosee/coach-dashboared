import { NextResponse } from 'next/server';
import { getCertificateClaimByToken } from '@/lib/certificates/public';

/**
 * Lightweight public status endpoint for the claim page to poll while a
 * competitor fills out the Fillout survey. Returns just the survey-complete
 * boolean — nothing identifying. 404 if the token is invalid.
 */
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const cert = await getCertificateClaimByToken(token);
    if (!cert) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({
      surveyCompleted: !!cert.survey_completed_at,
      hasPdf: !!cert.storage_path,
    });
  } catch {
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
