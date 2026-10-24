// API endpoints used by the analyzer. The real routes are the default.
//
// DEV ONLY: open the page with `?mock=<scenario>` during `next dev` to replay fixtures from
// app/api/dev-mock instead of calling the LLM. In production builds `NODE_ENV` is inlined as
// 'production', so the switch below is dead code and the mock routes answer 404 anyway.

/**
 * ok: happy path (eligibility follows the selected country: EMEA → eligible, else not eligible)
 * flags: drafts with honesty flags · slow: 4× slower · error: analysis fails mid-stream
 * draft_error: drafts fail mid-stream · quota / busy / bad_input: analysis rejected before streaming
 */
export const DEV_MOCK_SCENARIOS = [
  'ok',
  'flags',
  'slow',
  'error',
  'draft_error',
  'quota',
  'busy',
  'bad_input',
] as const;
export type DevMockScenario = (typeof DEV_MOCK_SCENARIOS)[number];

export interface Endpoints {
  analyze: string;
  draft: string;
  /** Set when the dev mock is active, so the UI can show a visible "mock" marker. */
  mock: DevMockScenario | null;
}

export const REAL_ENDPOINTS: Endpoints = Object.freeze({ analyze: '/api/analyze', draft: '/api/draft', mock: null });

/** Reads `?mock=` from the current URL (client only). `?mock=1` means the happy path. */
export function resolveEndpoints(): Endpoints {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return REAL_ENDPOINTS;
  const value = new URLSearchParams(window.location.search).get('mock');
  if (value === null) return REAL_ENDPOINTS;
  const scenario: DevMockScenario = (DEV_MOCK_SCENARIOS as readonly string[]).includes(value)
    ? (value as DevMockScenario)
    : 'ok';
  const q = `?scenario=${scenario}`;
  return { analyze: `/api/dev-mock/analyze${q}`, draft: `/api/dev-mock/draft${q}`, mock: scenario };
}
