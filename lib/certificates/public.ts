import { createClient } from '@supabase/supabase-js';
import { config } from '@/lib/config';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

export const CERTIFICATE_STORAGE_BUCKET =
  process.env.SUPABASE_CERTIFICATES_BUCKET || 'competition-certificates';

export const COMPETITOR_FILLOUT_FORM_ID =
  process.env.NEXT_PUBLIC_FILLOUT_COMPETITOR_FORM_ID || 'ca1hRrHGijus';

export type CertificateClaimRecord = {
  id: string;
  competitor_id: string;
  certificate_year: number;
  storage_path: string | null;
  claim_token: string | null;
  survey_completed_at: string | null;
  downloaded_at: string | null;
  download_count: number | null;
  competitors: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
};

export function createCertificateServiceClient() {
  if (!supabaseUrl) {
    throw new Error('Missing Supabase service role configuration');
  }

  return createClient(supabaseUrl, config.supabase.secretKey, {
    auth: { persistSession: false },
  });
}

export async function getCertificateClaimByToken(token: string): Promise<CertificateClaimRecord | null> {
  const supabase = createCertificateServiceClient();
  const { data, error } = await supabase
    .from('competitor_certificates')
    .select(
      'id, competitor_id, certificate_year, storage_path, claim_token, survey_completed_at, downloaded_at, download_count, competitors(id, first_name, last_name)'
    )
    .eq('claim_token', token)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return data as unknown as CertificateClaimRecord;
}

export function buildCertificateDownloadFilename(record: CertificateClaimRecord) {
  const first = record.competitors?.first_name?.trim() || 'Competitor';
  const last = record.competitors?.last_name?.trim() || '';
  const rawName = `${first}_${last}`.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  const safeName = rawName || 'Competitor';
  return `${safeName}_Certificate_${record.certificate_year}.pdf`;
}
