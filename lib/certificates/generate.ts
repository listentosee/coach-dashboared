import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  CERTIFICATE_STORAGE_BUCKET,
  createCertificateServiceClient,
} from '@/lib/certificates/public';

/**
 * Certificate PDFs live at `public/certificate/Certificate-<year>.pdf` and
 * contain a text form field named {{competitor}} at the spot where the
 * student's name should appear. To roll a new season, drop a template at
 * the year-matching path with that same field name — no code change needed.
 *
 * We fill the field via pdf-lib's form API and flatten it, so the finished
 * PDF is plain (non-interactive). Zero runtime PDF parsing, zero Node DOM
 * polyfills, zero coordinate hunting.
 */

const COMPETITOR_FIELD_NAME = '{{competitor}}';

function resolveTemplatePath(year: number): string {
  return path.join(process.cwd(), `public/certificate/Certificate-${year}.pdf`);
}

type EligibleCompetitor = {
  id: string;
  first_name: string;
  last_name: string;
  game_platform_id: string | null;
  email_personal: string | null;
  email_school: string | null;
  game_platform_onboarding_email?: string | null;
  game_platform_stats: Array<{
    challenges_completed: number | null;
    monthly_ctf_challenges: number | null;
    last_activity: string | null;
  }> | null;
};

function getCertificateYear(input?: number | null) {
  return input || new Date().getFullYear();
}

function getStudentStorageId(competitor: EligibleCompetitor) {
  return competitor.game_platform_id?.trim() || competitor.id;
}

function getCompetitorFullName(competitor: Pick<EligibleCompetitor, 'first_name' | 'last_name'>) {
  return `${competitor.first_name} ${competitor.last_name}`.trim();
}

async function generateCertificatePdf(competitorName: string, year: number) {
  const templatePath = resolveTemplatePath(year);
  let templateBytes: Buffer;
  try {
    templateBytes = await readFile(templatePath);
  } catch {
    throw new Error(
      `Certificate template for year ${year} not found at ${templatePath}. ` +
        `Drop a PDF at that path with a text form field named "${COMPETITOR_FIELD_NAME}".`,
    );
  }

  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();

  let field;
  try {
    field = form.getTextField(COMPETITOR_FIELD_NAME);
  } catch {
    const available = form.getFields().map((f) => f.getName());
    throw new Error(
      `Template for year ${year} is missing the "${COMPETITOR_FIELD_NAME}" text field. ` +
        `Available fields: ${available.length ? available.join(', ') : '(none)'}.`,
    );
  }

  field.setText(competitorName);

  // Use the embedded Helvetica so flattened output is consistent across
  // machines that may or may not have the template's fonts installed.
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  field.updateAppearances(font);
  form.flatten();

  return pdfDoc.save();
}

export async function uploadCertificatePdf(options: {
  competitor: EligibleCompetitor;
  certificateYear?: number | null;
}) {
  const { competitor } = options;
  const certificateYear = getCertificateYear(options.certificateYear);
  const studentStorageId = getStudentStorageId(competitor);
  const fullName = getCompetitorFullName(competitor);
  const pdfBytes = await generateCertificatePdf(fullName, certificateYear);
  const storagePath = `${certificateYear}/${studentStorageId}.pdf`;

  const supabase = createCertificateServiceClient();
  const { error } = await supabase.storage
    .from(CERTIFICATE_STORAGE_BUCKET)
    .upload(storagePath, pdfBytes, {
      upsert: true,
      contentType: 'application/pdf',
    });

  if (error) {
    throw new Error(`Failed to upload certificate PDF: ${error.message}`);
  }

  return {
    storagePath,
    studentId: studentStorageId,
    certificateYear,
    fullName,
  };
}

export async function resolveEligibleCompetitors(options?: {
  competitorIds?: string[];
}) {
  const supabase = createCertificateServiceClient();
  let query = supabase
    .from('competitors')
    .select(
      'id, first_name, last_name, game_platform_id, email_personal, email_school, game_platform_onboarding_email, game_platform_stats(challenges_completed, monthly_ctf_challenges, last_activity)'
    )
    .eq('is_active', true)
    .not('game_platform_id', 'is', null);

  const explicitIds = options?.competitorIds?.length ? options.competitorIds : null;
  if (explicitIds) {
    query = query.in('id', explicitIds);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const competitors = (data || []) as unknown as EligibleCompetitor[];

  // When the admin explicitly scopes to specific IDs (e.g. a live end-to-end
  // test with test competitors), honor them regardless of play activity.
  // Without explicit IDs, keep the activity filter so bulk runs don't
  // generate certificates for rostered-but-inactive competitors.
  if (explicitIds) {
    return competitors;
  }

  return competitors.filter((competitor) => {
    const stats = Array.isArray(competitor.game_platform_stats)
      ? competitor.game_platform_stats[0]
      : null;

    return Boolean(
      stats?.last_activity ||
      (stats?.challenges_completed || 0) > 0 ||
      (stats?.monthly_ctf_challenges || 0) > 0
    );
  });
}

export async function upsertCertificateRecord(options: {
  competitorId: string;
  studentId: string;
  certificateYear: number;
  storagePath: string;
}) {
  const supabase = createCertificateServiceClient();
  const { data, error } = await supabase
    .from('competitor_certificates')
    .upsert(
      {
        competitor_id: options.competitorId,
        student_id: options.studentId,
        certificate_year: options.certificateYear,
        storage_path: options.storagePath,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'competitor_id,certificate_year' }
    )
    .select('id, competitor_id, student_id, certificate_year, storage_path, claim_token')
    .single();

  if (error) {
    throw error;
  }

  return data;
}
