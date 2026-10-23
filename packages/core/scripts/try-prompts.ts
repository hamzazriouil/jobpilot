// Try the versioned prompts on the eval seed cases + the landing-page sample.
//
//   npx tsx scripts/try-prompts.ts            (from packages/core)
//
// - GOOGLE_GENERATIVE_AI_API_KEY set AND src/llm exports runLLM → live mode: runs analyze on each
//   case through runLLM (Gemini), prints schema-valid, eligibility vs expected, requirement counts.
// - Otherwise → dry-run: prints prompt sizes (chars, ~tokens) and checks the fence tags.
// Never logs CV or job text.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AnalysisLLM } from '../src/schemas';
import {
  ANALYZE_PROMPT_VERSION,
  DRAFT_PROMPT_VERSION,
  SAMPLE_ANALYSIS_FIXTURE,
  SAMPLE_COUNTRY,
  SAMPLE_CV,
  SAMPLE_JOB,
  approxTokens,
  buildAnalyzePrompt,
  buildDraftPrompt,
  checkTags,
  type BuiltPrompt,
} from '../src/prompts';

interface EvalCase {
  id: string;
  cvText: string;
  jobText: string;
  country: string;
  expected: { eligibility: string; band: string };
  tags: string[];
}

const DATASET_DIR = fileURLToPath(new URL('../../../evals/dataset/', import.meta.url));
const LLM_INDEX = fileURLToPath(new URL('../src/llm/index.ts', import.meta.url));

function loadCases(): EvalCase[] {
  const cases: EvalCase[] = existsSync(DATASET_DIR)
    ? readdirSync(DATASET_DIR)
        .filter((f) => /^\d{3}\.json$/.test(f))
        .sort()
        .map((f) => JSON.parse(readFileSync(DATASET_DIR + f, 'utf8')) as EvalCase)
    : [];
  cases.push({
    id: 'sample-landing',
    cvText: SAMPLE_CV,
    jobText: SAMPLE_JOB,
    country: SAMPLE_COUNTRY,
    expected: { eligibility: 'eligible', band: 'good' },
    tags: ['sample'],
  });
  return cases;
}

const pad = (s: string | number, n: number) => String(s).padEnd(n);
const size = (p: BuiltPrompt) => {
  const chars = p.system.length + p.prompt.length;
  return { chars, tokens: approxTokens(p.system) + approxTokens(p.prompt) };
};

function dryRun(cases: EvalCase[]): number {
  console.log(`DRY RUN (no GOOGLE_GENERATIVE_AI_API_KEY or no runLLM). Prompts: ${ANALYZE_PROMPT_VERSION}, ${DRAFT_PROMPT_VERSION}`);
  console.log('Draft prompts use the sample analysis fixture as the <analysis> input (shape check only).\n');
  console.log(`${pad('case', 26)}${pad('analyze chars', 15)}${pad('~tokens', 9)}${pad('draft chars', 13)}${pad('~tokens', 9)}tags`);
  let problems = 0;
  for (const c of cases) {
    const a = buildAnalyzePrompt(c);
    const d = buildDraftPrompt({ cvText: c.cvText, jobText: c.jobText, analysis: SAMPLE_ANALYSIS_FIXTURE });
    const issues = [...checkTags(a.prompt, ['cv', 'job_posting']), ...checkTags(d.prompt, ['cv', 'job_posting', 'analysis'])];
    problems += issues.length;
    const sa = size(a);
    const sd = size(d);
    console.log(
      `${pad(c.id, 26)}${pad(sa.chars, 15)}${pad(sa.tokens, 9)}${pad(sd.chars, 13)}${pad(sd.tokens, 9)}${issues.length ? 'PROBLEMS: ' + issues.join('; ') : 'ok'}`,
    );
  }
  const sys = buildAnalyzePrompt({ cvText: '', jobText: '', country: 'MA' }).system;
  const dsys = buildDraftPrompt({ cvText: '', jobText: '', analysis: SAMPLE_ANALYSIS_FIXTURE }).system;
  console.log(`\nSystem prompts alone: analyze ${sys.length} chars (~${approxTokens(sys)} tokens), draft ${dsys.length} chars (~${approxTokens(dsys)} tokens).`);
  console.log(problems ? `\n${problems} tag problem(s) found.` : '\nAll fence tags well formed.');
  return problems ? 1 : 0;
}

type RunLLM = (opts: Record<string, unknown>) => Promise<{ object: unknown; provider: string; model: string; latencyMs: number }>;

async function liveRun(cases: EvalCase[], runLLM: RunLLM, apiKey: string): Promise<number> {
  console.log(`LIVE RUN via runLLM (Gemini). Prompt: ${ANALYZE_PROMPT_VERSION}\n`);
  let eligOk = 0;
  let valid = 0;
  for (const c of cases) {
    const built = buildAnalyzePrompt(c);
    try {
      const res = await runLLM({
        task: 'analyze',
        ...built,
        schema: AnalysisLLM,
        plan: 'free',
        // Routing country (Cloudflare's), not the candidate's: a non-EEA value routes to Gemini.
        country: 'US',
        promptVersion: ANALYZE_PROMPT_VERSION,
        providers: { gemini: { apiKey } },
      });
      const parsed = AnalysisLLM.safeParse(res.object);
      if (!parsed.success) {
        console.log(`${pad(c.id, 26)}schema-valid: NO  (${parsed.error.issues.length} issues)`);
        continue;
      }
      valid++;
      const a = parsed.data;
      const count = (type: string, status: string) => a.requirements.filter((r) => r.type === type && r.status === status).length;
      const eligMatch = a.eligibility.verdict === c.expected.eligibility;
      if (eligMatch) eligOk++;
      console.log(
        `${pad(c.id, 26)}schema-valid: yes  eligibility: ${pad(a.eligibility.verdict, 13)}expected: ${pad(c.expected.eligibility, 13)}${eligMatch ? 'OK  ' : 'MISS'}` +
          `  reqs: ${a.requirements.length} (must ${count('must', 'met')}/${count('must', 'partial')}/${count('must', 'missing')} · nice ${count('nice', 'met')}/${count('nice', 'partial')}/${count('nice', 'missing')} met/partial/missing)` +
          `  levels: job ${a.job.level}, you ${a.candidateLevel}  redFlags: ${a.redFlags.length}  ${res.model} ${res.latencyMs}ms`,
      );
    } catch (err) {
      const e = err as { code?: string; message?: string };
      console.log(`${pad(c.id, 26)}ERROR ${e.code ?? ''} ${e.message ?? String(err)}`);
    }
  }
  console.log(`\nSchema-valid: ${valid}/${cases.length} · eligibility correct: ${eligOk}/${cases.length}`);
  console.log('Band accuracy needs scoring (src/scoring) and runs in `pnpm eval`.');
  return 0;
}

async function main() {
  const cases = loadCases();
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  let runLLM: RunLLM | undefined;
  if (apiKey && existsSync(LLM_INDEX)) {
    try {
      const mod = (await import(pathToFileURL(LLM_INDEX).href)) as { runLLM?: RunLLM };
      runLLM = mod.runLLM;
    } catch (err) {
      console.log(`Could not load src/llm (${(err as Error).message}). Falling back to dry run.\n`);
    }
  }
  process.exitCode = apiKey && runLLM ? await liveRun(cases, runLLM, apiKey) : dryRun(cases);
}

await main();
