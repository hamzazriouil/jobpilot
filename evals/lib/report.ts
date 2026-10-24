import { bandDistance, injectionPassed, isInjectionCase, type CaseRecord, type RunMetrics } from './metrics';

// Plain-text report for the terminal. No CV, job or draft text is printed.

const pct = (v: number | null) => (v === null ? 'n/a' : `${(v * 100).toFixed(0)}%`);
const ms = (v: number | null) => (v === null ? 'n/a' : `${(v / 1000).toFixed(1)}s`);

export function printMetrics(provider: string, model: string, m: RunMetrics): void {
  const rows: Array<[string, string]> = [
    ['provider / main model', `${provider} / ${model}`],
    ['models that served calls', Object.entries(m.modelsServed).map(([k, v]) => `${k} ×${v}`).join(', ') || 'none'],
    ['cases (labeled)', `${m.cases} (${m.labeledCases})`],
    ['eligibility accuracy', `${pct(m.eligibilityAcc)}   (model verdict before evidence check: ${pct(m.eligibilityAccPreCheck)})`],
    ['band accuracy (exact)', pct(m.bandAcc)],
    ['band accuracy (±1 band)', pct(m.bandWithin1)],
    ['schema-valid on first try', pct(m.schemaValid)],
    ['schema repair rate', pct(m.repairRate)],
    ['evidence-downgrade rate', `${pct(m.downgradeRate)} of met/partial claims (${m.downgradesPerAnalysis ?? 'n/a'} per analysis)`],
    ['honesty-flag rate', `${pct(m.honestyFlagRate)} of draft sets (${m.honestyFlagsPerDraft ?? 'n/a'} flags per set)`],
    [
      'injection resistance',
      `${m.injectionPassed}/${m.injectionCases} passed (canary leaks: ${m.injectionCanaryLeaks}, flagged as hidden instructions: ${m.injectionFlagged})`,
    ],
    ['analyze latency p50 / p95', `${ms(m.p50ms)} / ${ms(m.p95ms)}   (first partial p50 ${ms(m.firstPartialP50ms)})`],
    ['draft latency p50 / p95', `${ms(m.draftP50ms)} / ${ms(m.draftP95ms)}`],
    ['cost per case', `$${m.costPerCase.toFixed(4)}   (${m.inputTokensPerCase} in / ${m.outputTokensPerCase} out tokens)`],
    [
      'errors',
      `${m.errors} of ${m.calls} calls${Object.keys(m.errorCodes).length ? ` (${Object.entries(m.errorCodes).map(([k, v]) => `${k} ×${v}`).join(', ')})` : ''}; failed attempts incl. retried: ${m.retriedAttempts}`,
    ],
  ];
  const w = Math.max(...rows.map(([k]) => k.length));
  console.log('\n── Metrics ' + '─'.repeat(60));
  for (const [k, v] of rows) console.log(`${k.padEnd(w)}  ${v}`);
}

export function printCaseTable(records: readonly CaseRecord[]): void {
  console.log('\n── Per case ' + '─'.repeat(59));
  const head = ['case', 'expected', 'got (after check)', 'score', 'model elig.', 'levels job/cand', 'dg', 'flags', 'notes'];
  const lines: string[][] = [head];
  for (const r of records) {
    const a = r.analyze;
    const exp = r.expected ? `${r.expected.eligibility}/${r.expected.band}` : '(unlabeled)';
    const got = a.ok ? `${a.eligibility}/${a.band}` : `ERROR ${a.errorCode}`;
    const notes: string[] = [];
    if (r.expected && a.ok) {
      if (a.eligibility !== r.expected.eligibility) notes.push('ELIG MISS');
      if (a.band !== r.expected.band) notes.push(bandDistance(a.band!, r.expected.band) <= 1 ? 'band ±1' : 'BAND MISS');
    }
    if (isInjectionCase(r)) notes.push(injectionPassed(r) ? 'injection ok' : 'INJECTION FAIL');
    if (r.draft?.canaryHits?.length) notes.push(`canary: ${r.draft.canaryHits.join(',')}`);
    if (a.eligibilityDowngraded) notes.push('elig quote unverified');
    if (r.draft && !r.draft.ok) notes.push(`draft ERROR ${r.draft.errorCode}`);
    lines.push([
      r.id.slice(0, 34),
      exp,
      got,
      a.ok ? String(a.score) : '-',
      a.llmEligibility ?? '-',
      a.ok ? `${a.jobLevel}/${a.candidateLevel}` : '-',
      a.ok ? String(a.downgrades) : '-',
      r.draft?.ok ? String(r.draft.honestyFlags!.length) : '-',
      notes.join('; '),
    ]);
  }
  const widths = head.map((_, i) => Math.max(...lines.map((l) => l[i]!.length)));
  for (const l of lines) console.log(l.map((cell, i) => cell.padEnd(widths[i]!)).join('  ').trimEnd());

  const flagged = records.filter((r) => r.draft?.honestyFlags?.length);
  if (flagged.length) {
    console.log('\nHonesty flags (draft facts not found in the CV or job post):');
    for (const r of flagged) console.log(`  ${r.id}: ${r.draft!.honestyFlags!.map((f) => `${f.draft}:"${f.text}"`).join(', ')}`);
  }
}
