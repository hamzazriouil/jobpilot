import type { z } from 'zod';

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string };

const MAX_ISSUES = 20;

/**
 * Lenient JSON extraction: accepts raw JSON, ```json fenced blocks, or JSON surrounded by prose
 * (common with open-weight models when JSON mode is not strictly enforced).
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const candidates: string[] = [trimmed];
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fence?.[1]) candidates.push(fence[1].trim());
  const start = trimmed.search(/[{[]/);
  const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
  if (start !== -1 && end > start) candidates.push(trimmed.slice(start, end + 1));
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      // try next candidate
    }
  }
  throw new SyntaxError('Response is not valid JSON');
}

export function formatZodIssues(error: z.ZodError): string {
  const lines = error.issues.slice(0, MAX_ISSUES).map((i) => {
    const path = i.path.length ? i.path.map(String).join('.') : '(root)';
    return `- ${path}: ${i.message}`;
  });
  if (error.issues.length > MAX_ISSUES) lines.push(`- ...and ${error.issues.length - MAX_ISSUES} more`);
  return lines.join('\n');
}

export function parseWithSchema<S extends z.ZodType>(text: string, schema: S): ParseResult<z.output<S>> {
  let json: unknown;
  try {
    json = extractJson(text);
  } catch {
    return { ok: false, errors: '- (root): the response was not valid JSON. Return a single JSON object only.' };
  }
  const result = schema.safeParse(json);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, errors: formatZodIssues(result.error) };
}

export function buildRepairMessage(errors: string): string {
  return [
    'Your previous response did not match the required JSON schema.',
    'Validation errors:',
    errors,
    'Return the corrected JSON object only: no prose, no markdown fences.',
  ].join('\n');
}
