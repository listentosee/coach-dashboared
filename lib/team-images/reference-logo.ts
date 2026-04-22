/**
 * Small helpers for accepting a reference logo from an admin request body.
 * The logo is passed as a data URL (e.g. "data:image/png;base64,iVBORw0...")
 * — simple for the client (FileReader.readAsDataURL) and self-describing.
 * We parse it into { mimeType, data } suitable for the Gemini client.
 *
 * We do NOT persist these bytes anywhere — they flow through one Gemini
 * request and are then discarded.
 */

import type { ReferenceImage } from '@/lib/integrations/gemini/image';

/** ~2 MB cap after base64 decode. */
const MAX_DECODED_BYTES = 2 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/svg+xml',
]);

export function parseReferenceLogoDataUrl(
  dataUrl: string | undefined | null,
): ReferenceImage | undefined {
  if (!dataUrl || typeof dataUrl !== 'string') return undefined;

  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Reference logo must be a base64 data URL');
  }

  const mimeType = match[1].toLowerCase();
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new Error(`Unsupported logo mime type: ${mimeType}`);
  }

  const data = match[2];
  // Rough byte estimate — base64 is ~4/3 of raw
  const approxBytes = Math.floor(data.length * 0.75);
  if (approxBytes > MAX_DECODED_BYTES) {
    throw new Error(`Reference logo too large (${Math.round(approxBytes / 1024)} KB, max 2048 KB)`);
  }

  return { mimeType, data };
}
