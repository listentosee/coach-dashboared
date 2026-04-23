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

/**
 * Minimal DOMMatrix polyfill for Node. pdfjs uses DOMMatrix for text
 * positioning math during getTextContent(). Vercel's Node runtime has no
 * DOM globals, so without this pdfjs throws `DOMMatrix is not defined`
 * the first time it tries to lay out text.
 *
 * Only the methods pdfjs actually calls during text extraction are
 * implemented. If a future pdfjs version needs more, the missing-method
 * error will point us at exactly what to add.
 */
function ensureDomMatrixPolyfill() {
  const g = globalThis as unknown as { DOMMatrix?: unknown };
  if (g.DOMMatrix) return;

  class DOMMatrixPolyfill {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    m11 = 1; m12 = 0; m13 = 0; m14 = 0;
    m21 = 0; m22 = 1; m23 = 0; m24 = 0;
    m31 = 0; m32 = 0; m33 = 1; m34 = 0;
    m41 = 0; m42 = 0; m43 = 0; m44 = 1;
    is2D = true;
    isIdentity = true;

    constructor(init?: number[] | string | DOMMatrixPolyfill) {
      if (Array.isArray(init)) {
        if (init.length === 6) {
          [this.a, this.b, this.c, this.d, this.e, this.f] = init;
        } else if (init.length === 16) {
          [this.m11, this.m12, this.m13, this.m14,
           this.m21, this.m22, this.m23, this.m24,
           this.m31, this.m32, this.m33, this.m34,
           this.m41, this.m42, this.m43, this.m44] = init;
          this.is2D = false;
        }
        this.#syncShorthand();
      } else if (init && typeof init === 'object') {
        Object.assign(this, init);
      }
      this.isIdentity = this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0;
    }

    #syncShorthand() {
      this.m11 = this.a; this.m12 = this.b;
      this.m21 = this.c; this.m22 = this.d;
      this.m41 = this.e; this.m42 = this.f;
    }

    multiply(other: DOMMatrixPolyfill) {
      const r = new DOMMatrixPolyfill();
      r.a = this.a * other.a + this.c * other.b;
      r.b = this.b * other.a + this.d * other.b;
      r.c = this.a * other.c + this.c * other.d;
      r.d = this.b * other.c + this.d * other.d;
      r.e = this.a * other.e + this.c * other.f + this.e;
      r.f = this.b * other.e + this.d * other.f + this.f;
      r.#syncShorthand();
      r.isIdentity = r.a === 1 && r.b === 0 && r.c === 0 && r.d === 1 && r.e === 0 && r.f === 0;
      return r;
    }

    translate(tx: number, ty: number) {
      const r = new DOMMatrixPolyfill();
      r.a = this.a; r.b = this.b; r.c = this.c; r.d = this.d;
      r.e = this.a * tx + this.c * ty + this.e;
      r.f = this.b * tx + this.d * ty + this.f;
      r.#syncShorthand();
      r.isIdentity = false;
      return r;
    }

    scale(sx: number, sy = sx) {
      const r = new DOMMatrixPolyfill();
      r.a = this.a * sx; r.b = this.b * sx;
      r.c = this.c * sy; r.d = this.d * sy;
      r.e = this.e; r.f = this.f;
      r.#syncShorthand();
      r.isIdentity = false;
      return r;
    }

    scaleNonUniform(sx: number, sy: number) {
      return this.scale(sx, sy);
    }

    inverse() {
      const det = this.a * this.d - this.b * this.c;
      const r = new DOMMatrixPolyfill();
      if (det === 0) return r;
      r.a = this.d / det;
      r.b = -this.b / det;
      r.c = -this.c / det;
      r.d = this.a / det;
      r.e = (this.c * this.f - this.d * this.e) / det;
      r.f = (this.b * this.e - this.a * this.f) / det;
      r.#syncShorthand();
      r.isIdentity = false;
      return r;
    }

    transformPoint(p: { x: number; y: number }) {
      return {
        x: this.a * p.x + this.c * p.y + this.e,
        y: this.b * p.x + this.d * p.y + this.f,
      };
    }
  }

  g.DOMMatrix = DOMMatrixPolyfill as any;
}

async function loadPdfjs() {
  ensureDomMatrixPolyfill();
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
