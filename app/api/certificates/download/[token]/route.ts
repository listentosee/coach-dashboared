import { Buffer } from 'node:buffer';
import { NextResponse } from 'next/server';
import {
  buildCertificateDownloadFilename,
  CERTIFICATE_STORAGE_BUCKET,
  createCertificateServiceClient,
  getCertificateClaimByToken,
} from '@/lib/certificates/public';
import { AuditLogger } from '@/lib/audit/audit-logger';

export const dynamic = 'force-dynamic';

function contentDisposition(filename: string) {
  const safe = filename.replace(/["\r\n]/g, '').trim() || 'certificate.pdf';
  const ascii = safe.replace(/[^\x20-\x7E]+/g, '');
  const fallback = ascii || 'certificate.pdf';
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const certificate = await getCertificateClaimByToken(token);

    if (!certificate) {
      return NextResponse.json({ error: 'Certificate claim not found' }, { status: 404 });
    }

    if (!certificate.survey_completed_at) {
      return NextResponse.json({ error: 'Survey must be completed before download' }, { status: 403 });
    }

    if (!certificate.storage_path) {
      return NextResponse.json({ error: 'Certificate PDF is not available yet' }, { status: 404 });
    }

    const supabase = createCertificateServiceClient();
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from(CERTIFICATE_STORAGE_BUCKET)
      .download(certificate.storage_path);

    if (downloadError || !fileData) {
      return NextResponse.json(
        { error: downloadError?.message || 'Certificate file could not be downloaded' },
        { status: 404 }
      );
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const downloadCount = certificate.download_count || 0;

    await supabase
      .from('competitor_certificates')
      .update({
        downloaded_at: new Date().toISOString(),
        download_count: downloadCount + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', certificate.id);

    await AuditLogger.logAction(supabase, {
      user_id: null, // token-based public download — no authenticated user
      action: 'certificate_downloaded',
      entity_type: 'competitor_certificate',
      entity_id: certificate.id,
      metadata: {
        competitor_id: certificate.competitor_id,
        certificate_year: certificate.certificate_year,
        download_count: downloadCount + 1,
      },
    });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': buffer.byteLength.toString(),
        'Content-Disposition': contentDisposition(buildCertificateDownloadFilename(certificate)),
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (error) {
    console.error('Certificate download error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
