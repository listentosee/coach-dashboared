import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  CERTIFICATE_STORAGE_BUCKET,
  createCertificateServiceClient,
} from '@/lib/certificates/public';

// pdfjs-dist v5 has a top-level dependency on @napi-rs/canvas that
// Vercel serverless can't load. Importing it at module top crashed every
// request to any route that transitively loaded this file — including
// dry-run certificate generation, which doesn't actually need pdfjs.
// Lazy-import it only when we need to extract the placeholder rect.
let pdfjsGetDocument: typeof import('pdfjs-dist/legacy/build/pdf.mjs').getDocument | null = null;
async function loadPdfjs() {
  if (!pdfjsGetDocument) {
    const mod = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjsGetDocument = mod.getDocument;
  }
  return pdfjsGetDocument;
}

const PLACEHOLDER_TEXT = 'This certificate is proudly presented to: {{competitor}}';

/**
 * Template PDFs live at `public/certificate/Certificate-<year>.pdf`. To
 * roll a new season, drop the new PDF at the year-matching path — no
 * code change needed. The request body's `certificateYear` (falling back
 * to the current calendar year) decides which template is used.
 */
function resolveTemplatePath(year: number): string {
  return path.join(process.cwd(), `public/certificate/Certificate-${year}.pdf`);
}

type PlaceholderRect = {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

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

// Cache the placeholder rect per template year — each year gets its own
// resolved rect, so callers pay the text-extraction cost once per year.
const placeholderPromiseByYear = new Map<number, Promise<PlaceholderRect>>();

function getCertificateYear(input?: number | null) {
  return input || new Date().getFullYear();
}

function getStudentStorageId(competitor: EligibleCompetitor) {
  return competitor.game_platform_id?.trim() || competitor.id;
}

function getCompetitorFullName(competitor: Pick<EligibleCompetitor, 'first_name' | 'last_name'>) {
  return `${competitor.first_name} ${competitor.last_name}`.trim();
}

export function getCompetitorEmail(competitor: EligibleCompetitor) {
  return (
    competitor.game_platform_onboarding_email ||
    competitor.email_personal ||
    competitor.email_school ||
    null
  );
}

export async function resolveCertificatePlaceholder(year: number): Promise<PlaceholderRect> {
  const cached = placeholderPromiseByYear.get(year);
  if (cached) return cached;

  const templatePath = resolveTemplatePath(year);
  const promise = (async () => {
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await readFile(templatePath));
    } catch (err) {
      throw new Error(
        `Certificate template for year ${year} not found at ${templatePath}. ` +
          `Drop a PDF at that path (matching the PLACEHOLDER_TEXT pattern) to enable generation.`,
      );
    }

    const getDocument = await loadPdfjs();
    const pdf = await getDocument({ data: bytes }).promise;

    for (let pageIndex = 0; pageIndex < pdf.numPages; pageIndex += 1) {
      const page = await pdf.getPage(pageIndex + 1);
      const content = await page.getTextContent();

      for (const item of content.items as Array<{
        str?: string;
        transform?: number[];
        width?: number;
        height?: number;
      }>) {
        if (item.str !== PLACEHOLDER_TEXT || !item.transform) {
          continue;
        }

        return {
          pageIndex,
          x: item.transform[4] || 0,
          y: item.transform[5] || 0,
          width: item.width || 0,
          height: item.height || 17,
        };
      }
    }

    throw new Error(`Could not locate certificate placeholder text in template for year ${year}`);
  })();

  placeholderPromiseByYear.set(year, promise);
  return promise;
}

export async function generateCertificatePdf(competitorName: string, year: number) {
  const templatePath = resolveTemplatePath(year);
  const [templateBytes, placeholder] = await Promise.all([
    readFile(templatePath),
    resolveCertificatePlaceholder(year),
  ]);

  const pdfDoc = await PDFDocument.load(templateBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const page = pdfDoc.getPage(placeholder.pageIndex);
  const line = `This certificate is proudly presented to: ${competitorName}`;
  const maxWidth = placeholder.width + 16;

  let fontSize = 17;
  while (font.widthOfTextAtSize(line, fontSize) > maxWidth && fontSize > 11) {
    fontSize -= 0.5;
  }

  page.drawRectangle({
    x: placeholder.x - 6,
    y: placeholder.y - 4,
    width: maxWidth + 12,
    height: placeholder.height + 10,
    color: rgb(1, 1, 1),
  });

  page.drawText(line, {
    x: placeholder.x,
    y: placeholder.y,
    size: fontSize,
    font,
    color: rgb(0.05, 0.05, 0.05),
  });

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

  if (options?.competitorIds?.length) {
    query = query.in('id', options.competitorIds);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const competitors = (data || []) as unknown as EligibleCompetitor[];
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
