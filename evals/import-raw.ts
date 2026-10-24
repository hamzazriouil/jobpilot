/**
 * Turns the founder's real job posts into eval cases (docs/05-ARCHITECTURE.md §13).
 *
 *   pnpm eval:import-raw [--country MA] [--force]
 *
 * Reads   evals/raw/cv.txt            (your CV, anonymized: see evals/dataset/README.md)
 *         evals/raw/job-NN.txt        (line 1: the job post URL, then the post text)
 * Writes  evals/raw/cases/0NN.json    with `expected: null` for you to fill in.
 *
 * evals/raw/ is gitignored. Existing case files are kept (your labels are not overwritten)
 * unless --force. Then run: pnpm eval --provider gemini --include-raw
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { AnalyzeRequest } from '@jobpilot/core/schemas';
import { RAW_CASES_DIR, RAW_DIR } from './lib/paths';

function main(): void {
  const { values } = parseArgs({
    options: { country: { type: 'string', default: 'MA' }, force: { type: 'boolean', default: false } },
  });
  const country = values.country!.toUpperCase();

  const cvPath = join(RAW_DIR, 'cv.txt');
  if (!existsSync(cvPath)) throw new Error(`Missing ${cvPath}. Put your anonymized CV there as plain text.`);
  const cvText = readFileSync(cvPath, 'utf8').replace(/^﻿/, '').trim();

  const jobs = readdirSync(RAW_DIR)
    .filter((f) => /^job-\d{1,3}\.txt$/i.test(f))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  if (jobs.length === 0) throw new Error(`No job-NN.txt files in ${RAW_DIR}.`);

  mkdirSync(RAW_CASES_DIR, { recursive: true });
  let written = 0;
  let kept = 0;
  for (const f of jobs) {
    const nnn = f.match(/\d+/)![0].padStart(3, '0');
    const out = join(RAW_CASES_DIR, `${nnn}.json`);
    if (existsSync(out) && !values.force) {
      kept++;
      continue;
    }
    const text = readFileSync(join(RAW_DIR, f), 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
    const nl = text.indexOf('\n');
    const firstLine = (nl < 0 ? text : text.slice(0, nl)).trim();
    const hasUrl = /^https?:\/\//i.test(firstLine);
    const jobText = (hasUrl ? text.slice(nl + 1) : text).trim();
    if (!hasUrl) console.warn(`  ${f}: first line is not a URL; the whole file is used as the post.`);

    const api = AnalyzeRequest.safeParse({ cvText, jobText, country });
    if (!api.success) {
      console.warn(`  ${f}: skipped, fails the API input limits: ${api.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
      continue;
    }
    const evalCase = {
      id: `raw-${nnn}`,
      source: hasUrl ? firstLine : undefined,
      cvText,
      jobText,
      country,
      // Fill in by hand: { "eligibility": "eligible|unclear|not_eligible", "band": "strong|good|stretch|long_shot" }.
      // Left null, the case is scored for latency, schema validity and honesty only.
      expected: null,
      tags: ['raw'],
    };
    writeFileSync(out, JSON.stringify(evalCase, null, 2) + '\n');
    written++;
  }
  console.log(`Wrote ${written} case(s) to ${RAW_CASES_DIR}${kept ? `, kept ${kept} existing (use --force to overwrite)` : ''}.`);
  console.log('Next: set "expected" in each file, then run: pnpm eval --provider gemini --include-raw');
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
