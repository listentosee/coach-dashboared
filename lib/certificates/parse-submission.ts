/**
 * Helpers for reading Fillout submissions out of survey_results.results_jsonb.
 *
 * The webhook stores the entire Fillout payload plus a copy of the nested
 * submission and the URL parameters. This module normalizes that into a
 * flat array of { question, answer } pairs suitable for display and export.
 */

export interface ParsedAnswer {
  id: string;
  question: string;
  type: string | null;
  answer: string;
}

type FilloutQuestion = {
  id?: string;
  name?: string;
  type?: string;
  value?: unknown;
};

/** Flatten any Fillout value to a display string. */
function answerToString(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) {
    return value.map((v) => answerToString(v)).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    // Fillout sometimes nests file uploads / choices with { value, label }
    const obj = value as Record<string, unknown>;
    if (typeof obj.label === 'string') return obj.label;
    if (typeof obj.value === 'string' || typeof obj.value === 'number') return String(obj.value);
    if (typeof obj.text === 'string') return obj.text;
    try {
      return JSON.stringify(value);
    } catch {
      return '[unreadable]';
    }
  }
  return String(value);
}

/** Extract the questions array from whatever shape `results_jsonb` ended up in. */
function extractQuestions(resultsJsonb: unknown): FilloutQuestion[] {
  if (!resultsJsonb || typeof resultsJsonb !== 'object') return [];
  const root = resultsJsonb as Record<string, unknown>;

  const submission = root.submission as Record<string, unknown> | undefined;
  if (submission && Array.isArray(submission.questions)) {
    return submission.questions as FilloutQuestion[];
  }

  const raw = root.raw_payload as Record<string, unknown> | undefined;
  if (raw) {
    if (Array.isArray((raw as any).questions)) return (raw as any).questions;
    const nested = (raw as any).submission;
    if (nested && Array.isArray(nested.questions)) return nested.questions;
  }

  if (Array.isArray((root as any).questions)) return (root as any).questions;
  return [];
}

export function parseSubmissionAnswers(resultsJsonb: unknown): ParsedAnswer[] {
  const questions = extractQuestions(resultsJsonb);
  return questions.map((q, i) => ({
    id: q.id || q.name || `q-${i + 1}`,
    question: q.name || q.id || `Question ${i + 1}`,
    type: q.type ?? null,
    answer: answerToString(q.value),
  }));
}

/**
 * For CSV export: build a stable column order from the union of question ids
 * across all submissions, and a helper that yields each row's values in that
 * order. Using question id (not name) as the column key avoids duplicate
 * columns when question text differs by a stray space.
 */
export interface ColumnDescriptor {
  id: string;
  label: string;
}

export function collectColumns(submissions: unknown[]): ColumnDescriptor[] {
  const seen = new Map<string, string>(); // id -> label (first seen)
  for (const s of submissions) {
    const qs = extractQuestions(s);
    qs.forEach((q, i) => {
      const id = q.id || q.name || `q-${i + 1}`;
      if (!seen.has(id)) seen.set(id, q.name || id);
    });
  }
  return Array.from(seen.entries()).map(([id, label]) => ({ id, label }));
}

export function rowValuesByColumn(resultsJsonb: unknown, columns: ColumnDescriptor[]): string[] {
  const answers = parseSubmissionAnswers(resultsJsonb);
  const byId = new Map(answers.map((a) => [a.id, a.answer]));
  return columns.map((c) => byId.get(c.id) ?? '');
}

export function escapeCsv(value: string): string {
  if (value === '' || value == null) return '';
  const needsQuoting = /[",\r\n]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuoting ? `"${escaped}"` : escaped;
}
