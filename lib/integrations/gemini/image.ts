/**
 * Gemini image generation client.
 *
 * Uses the Gemini REST API (google-generative-ai v1beta) to generate images
 * from a text prompt. Returns raw PNG bytes.
 *
 * The model is configurable via GEMINI_IMAGE_MODEL env var. Defaults to
 * "Nano Banana Pro" (gemini-3-pro-image-preview), which uses a reasoning
 * ("thinking") pass to render text faithfully — the weak point of earlier
 * Gemini image models. For lower-cost jobs where text fidelity doesn't
 * matter, set GEMINI_IMAGE_MODEL=gemini-3.1-flash-image-preview (Nano
 * Banana 2) or gemini-2.5-flash-image (original Nano Banana).
 */

const DEFAULT_MODEL = 'gemini-3-pro-image-preview';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface ReferenceImage {
  /** MIME type, e.g. "image/png" or "image/jpeg" */
  mimeType: string;
  /** Base64-encoded image bytes (no data URL prefix) */
  data: string;
}

export interface GenerateImageOptions {
  prompt: string;
  model?: string;
  timeoutMs?: number;
  /**
   * Optional reference images (logos, style refs). Passed as inline_data parts
   * alongside the prompt so Gemini can use them as visual references. Do NOT
   * use this for student photos — FERPA concerns apply; use descriptive text.
   */
  references?: ReferenceImage[];
}

export interface GenerateImageResult {
  bytes: Buffer;
  mimeType: string;
  modelUsed: string;
}

interface GeminiInlineData {
  mimeType?: string;
  mime_type?: string;
  data: string; // base64
}

interface GeminiPart {
  text?: string;
  inlineData?: GeminiInlineData;
  inline_data?: GeminiInlineData;
}

interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string; safetyRatings?: unknown };
}

export async function generateImage(options: GenerateImageOptions): Promise<GenerateImageResult> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY is not set');
  }

  const model = options.model ?? process.env.GEMINI_IMAGE_MODEL ?? DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs ?? 60_000;

  const url = `${API_BASE}/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;

  const requestParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
    { text: options.prompt },
  ];
  for (const ref of options.references ?? []) {
    requestParts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } });
  }

  const body = {
    contents: [{ role: 'user', parts: requestParts }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: '16:9' },
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Gemini API ${response.status}: ${errText.slice(0, 500)}`);
  }

  const data = (await response.json()) as GeminiResponse;

  if (data.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked prompt: ${data.promptFeedback.blockReason}`);
  }

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const inline = part.inlineData ?? part.inline_data;
    if (inline?.data) {
      const mimeType = inline.mimeType ?? inline.mime_type ?? 'image/png';
      return {
        bytes: Buffer.from(inline.data, 'base64'),
        mimeType,
        modelUsed: model,
      };
    }
  }

  const finishReason = data.candidates?.[0]?.finishReason ?? 'unknown';
  throw new Error(`Gemini returned no image data (finishReason: ${finishReason})`);
}
