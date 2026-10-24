// DEV ONLY: streams hand-written drafts for the sample pair as the /api/draft SSE stream
// (404 in production). `?scenario=flags` adds an invented fact plus matching honesty flags;
// `?scenario=draft_error` fails mid-stream.
import { DraftRequest, type DraftResultEvent, type DraftsLLM } from '@jobpilot/core/schemas';
import { devOnly, jsonError, scenarioFrom, sseReplay, wordPrefixes, type MockFrame } from '../_lib/replay';

export const dynamic = 'force-dynamic';

const COVER_LETTER = `Hi Quillstack team,

I'm Adam, a junior developer in Rabat who ships small AI products end to end. Your AI Product Engineer role stood out because it mixes prompts, evals and the React interface support agents use every day, which is the work I enjoy most.

During my internship at Kasbah Freight I built a shipment-tracking dashboard in React and TypeScript that the 12-person operations team used daily, plus an Express API with SQL queries on PostgreSQL. On my own I built ClipCraft, a FastAPI tool that uses the Gemini and Claude APIs with validated JSON outputs and a 25-transcript eval set to compare prompt versions. I also launched QuizLoop on Cloudflare Workers, which reached 38,000 visitors in its first 10 days.

I haven't built a retrieval pipeline in production yet, and I'm closing that gap with a small pgvector demo.

I'm based in Morocco, inside your EMEA hiring area, and can overlap with CET. I'd love to talk about your drafting assistant.

Best,
Adam Benjelloun`;

const INVENTED = ' Before that, I led a team of 6 engineers at Atlas Labs.';

const COLD_DM = `Hi! I'm Adam, a junior AI and full-stack developer in Morocco. I saw the AI Product Engineer role at Quillstack. I've shipped LLM features with structured outputs and evals (ClipCraft) and a React + TypeScript dashboard used daily at a logistics startup. Could I send you my CV and a short note about what I built?`;

const CV_BULLETS: DraftsLLM['cvBullets'] = [
  {
    original: 'Built an internal shipment-tracking dashboard in React and TypeScript, used daily by the 12-person operations team.',
    improved: 'Built a React and TypeScript shipment-tracking dashboard used daily by a 12-person operations team.',
  },
  {
    original: 'Designed structured JSON outputs with Pydantic validation and an automatic retry on invalid output.',
    improved: 'Shipped LLM features with Pydantic-validated JSON outputs and automatic retries on invalid model output.',
  },
  {
    original: 'Built a small eval set of 25 transcripts to compare prompt versions before shipping changes.',
    improved: 'Created a 25-case eval set to compare prompt versions before every release.',
  },
];

export async function POST(req: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;

  const body = DraftRequest.safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError('bad_input', 'cvText, jobText and analysisToken are required.', 400);

  const scenario = scenarioFrom(req);
  const flagged = scenario === 'flags';
  const coverLetter = flagged ? COVER_LETTER.replace('in its first 10 days.', `in its first 10 days.${INVENTED}`) : COVER_LETTER;
  const drafts: DraftsLLM = { coverLetter, coldDm: COLD_DM, cvBullets: CV_BULLETS };
  const result: DraftResultEvent = {
    drafts,
    honestyFlags: flagged
      ? [
          { draft: 'coverLetter', text: 'Atlas Labs' },
          { draft: 'coverLetter', text: '6' },
        ]
      : [],
  };

  const delay = scenario === 'slow' ? 320 : 80;
  const snaps: unknown[] = [];
  for (const text of wordPrefixes(drafts.coverLetter, 5)) snaps.push({ coverLetter: text });
  for (const text of wordPrefixes(drafts.coldDm, 5)) snaps.push({ coverLetter: drafts.coverLetter, coldDm: text });
  drafts.cvBullets.forEach((bullet, i) => {
    const done = drafts.cvBullets.slice(0, i);
    for (const improved of wordPrefixes(bullet.improved, 6)) {
      snaps.push({ ...drafts, cvBullets: [...done, { original: bullet.original, improved }] });
    }
  });

  const frames: MockFrame[] = snaps.map((data, i) => ({ event: 'partial', data, delayMs: i === 0 ? 500 : delay }));
  if (scenario === 'draft_error') {
    frames.splice(Math.floor(frames.length / 2));
    frames.push({ event: 'error', data: { error: { code: 'busy', message: 'Provider rate-limited (dev mock).' } }, delayMs: delay });
  } else {
    frames.push({ event: 'result', data: result, delayMs: delay });
  }
  return sseReplay(frames, req.signal);
}
