/**
 * Gemini image generation client.
 *
 * Uses the Gemini REST API (google-generative-ai v1beta) to generate images
 * from a text prompt. Returns raw PNG bytes.
 *
 * The model is configurable via GEMINI_IMAGE_MODEL env var; defaults to the
 * current "Nano Banana" image model (gemini-2.5-flash-image).
 */

const DEFAULT_MODEL = 'gemini-2.5-flash-image';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface GenerateImageOptions {
  prompt: string;
  model?: string;
  timeoutMs?: number;
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

  const body = {
    contents: [{ role: 'user', parts: [{ text: options.prompt }] }],
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
