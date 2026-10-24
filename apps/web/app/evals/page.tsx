import { PageShell } from '@/components/legal/legal-page';
import { getRequestContext } from '@/lib/server/env';
import { latestPerProvider, listEvalRuns, type EvalRun } from '@/lib/server/eval-runs';
import { pageMetadata } from '@/lib/site';
import { strings } from '@/lib/strings';
import { cn } from '@/lib/utils';

// Public eval results (docs/05-ARCHITECTURE.md §13). Server component, no client JS.
// Styling per docs/08-BRAND-UI.md §8: terminal-style provider cards, mono tabular numbers, signal
// for a pass and partial/miss for weak values (always with a glyph + sr-only word, never color alone).
// Rendered per request: OpenNext has no incremental cache configured (open-next.config.ts), so
// time-based revalidation isn't available yet; one small PostgREST read per view is cheap.

export const dynamic = 'force-dynamic';

const s = strings.evals;

export const metadata = pageMetadata({ title: s.metaTitle, description: s.description, path: '/evals' });

const pct = (v: number | null | undefined) => (v == null ? s.notAvailable : `${Math.round(v * 100)}%`);
const secs = (v: number | null | undefined) => (v == null ? s.notAvailable : s.seconds(v));
const date = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
const providerName = (p: string) => s.providers[p] ?? p;

/**
 * How a metric reads. Thresholds are our own judgment for a 10-case smoke test:
 * higher-is-better shares pass at >=90% and are weak at >=70%; lower-is-better shares pass at <=5%
 * and are weak at <=20%. Time and cost are neutral.
 */
type Tone = 'pass' | 'weak' | 'fail' | 'neutral';

const higherBetter = (v: number | null | undefined): Tone =>
  v == null ? 'neutral' : v >= 0.9 ? 'pass' : v >= 0.7 ? 'weak' : 'fail';
const lowerBetter = (v: number | null | undefined): Tone =>
  v == null ? 'neutral' : v <= 0.05 ? 'pass' : v <= 0.2 ? 'weak' : 'fail';
const ratio = (n: number | undefined, total: number | undefined) => (total ? (n ?? 0) / total : null);

const TONE_STYLE: Record<Tone, { glyph: string; className: string }> = {
  pass: { glyph: '✓', className: 'text-signal-text' },
  weak: { glyph: '◐', className: 'text-partial' },
  fail: { glyph: '✕', className: 'text-miss' },
  neutral: { glyph: '', className: 'text-foreground' },
};

function MetricList({ run }: { run: EvalRun }) {
  const m = run.metrics;
  const rows: Array<[string, string, Tone]> = [
    [s.metrics.eligibilityAcc, pct(m.eligibilityAcc), higherBetter(m.eligibilityAcc)],
    [s.metrics.bandAcc, pct(m.bandAcc), higherBetter(m.bandAcc)],
    [s.metrics.bandWithin1, pct(m.bandWithin1), higherBetter(m.bandWithin1)],
    [
      s.metrics.injection,
      m.injectionCases ? s.ofTotal(m.injectionPassed ?? 0, m.injectionCases) : s.notAvailable,
      higherBetter(ratio(m.injectionPassed, m.injectionCases)),
    ],
    [s.metrics.schemaValid, pct(m.schemaValid), higherBetter(m.schemaValid)],
    [s.metrics.repairRate, pct(m.repairRate), lowerBetter(m.repairRate)],
    [s.metrics.downgradeRate, pct(m.downgradeRate), lowerBetter(m.downgradeRate)],
    [s.metrics.honestyFlagRate, pct(m.honestyFlagRate), lowerBetter(m.honestyFlagRate)],
    [s.metrics.latency, `${secs(m.p50ms)} / ${secs(m.p95ms)}`, 'neutral'],
    [s.metrics.draftLatency, `${secs(m.draftP50ms)} / ${secs(m.draftP95ms)}`, 'neutral'],
    [s.metrics.cost, m.costPerCase == null ? s.notAvailable : s.costValue(m.costPerCase), 'neutral'],
    [
      s.metrics.errors,
      m.calls != null ? s.ofTotal(m.errors ?? 0, m.calls) : s.notAvailable,
      lowerBetter(ratio(m.errors, m.calls)),
    ],
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 xl:grid-cols-3">
      {rows.map(([k, v, tone]) => {
        const t = TONE_STYLE[tone];
        return (
          <div key={k} className="flex flex-col justify-between gap-2 rounded-lg border bg-background/50 p-3">
            <dt className="text-xs leading-snug text-muted-foreground">{k}</dt>
            <dd className={cn('font-mono text-base font-medium break-words tabular-nums sm:text-lg', t.className)}>
              {t.glyph ? (
                <span aria-hidden="true" className="mr-1.5">
                  {t.glyph}
                </span>
              ) : null}
              {v}
              {tone !== 'neutral' ? <span className="sr-only"> ({s.tone[tone]})</span> : null}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Band accuracy over runs (oldest → newest) as a sparkline, with the values as text for screen readers. */
function Trend({ provider, runs }: { provider: string; runs: EvalRun[] }) {
  const points = runs
    .filter((r) => r.metrics.bandAcc != null)
    .slice(0, 20)
    .reverse()
    .map((r) => ({ date: date(r.created_at), value: r.metrics.bandAcc as number }));
  if (points.length < 2) {
    return <p className="font-mono text-xs text-muted-foreground">{s.trendSingle}</p>;
  }
  const W = 240;
  const H = 56;
  const pad = 6;
  const x = (i: number) => pad + (i * (W - 2 * pad)) / (points.length - 1);
  const y = (v: number) => H - pad - v * (H - 2 * pad);
  const label = s.trendAriaLabel(providerName(provider), points.map((p) => s.trendPoint(p.date, pct(p.value))).join(', '));
  return (
    <figure className="grid gap-1">
      <figcaption className="font-mono text-xs text-muted-foreground">{s.trendTitle}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-14 w-full max-w-60 text-signal-text" role="img" aria-label={label}>
        {/* 0% and 100% guides, recessive */}
        <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} className="stroke-border" strokeWidth={1} />
        <line x1={pad} x2={W - pad} y1={y(1)} y2={y(1)} className="stroke-border" strokeWidth={1} strokeDasharray="2 3" />
        <polyline
          points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.value)} r={4} fill="currentColor" className="stroke-card" strokeWidth={2}>
            <title>{s.trendPoint(p.date, pct(p.value))}</title>
          </circle>
        ))}
      </svg>
    </figure>
  );
}

function CaseTable({ run }: { run: EvalRun }) {
  const cases = run.metrics.perCase ?? [];
  if (cases.length === 0) return null;
  const label = (e: string | null | undefined, b: string | null | undefined) =>
    e && b ? `${s.verdicts[e] ?? e} · ${s.bands[b] ?? b}` : s.failed;
  return (
    <details className="group rounded-lg border px-3 py-1">
      <summary className="flex min-h-10 cursor-pointer list-none items-center rounded-sm text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="mr-2 inline-block font-mono text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none">
          ›
        </span>
        {s.casesTitle}
      </summary>
      <div className="mt-3 overflow-x-auto">
        <table className="mb-2 w-full text-left font-mono text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th scope="col" className="py-1 pr-3 font-medium">{s.casesHead.case}</th>
              <th scope="col" className="py-1 pr-3 font-medium">{s.casesHead.expected}</th>
              <th scope="col" className="py-1 pr-3 font-medium">{s.casesHead.got}</th>
              <th scope="col" className="py-1 text-right font-medium">{s.casesHead.score}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {cases.map((c) => {
              const exp = c.expected ? label(c.expected.eligibility, c.expected.band) : s.unlabeled;
              const miss =
                c.expected && (c.error || c.eligibility !== c.expected.eligibility || c.band !== c.expected.band);
              return (
                <tr key={c.id}>
                  <td className="py-1 pr-3 font-mono">{c.id}</td>
                  <td className="py-1 pr-3">{exp}</td>
                  <td className="py-1 pr-3">
                    {label(c.eligibility, c.band)}
                    {miss ? (
                      <span className="ml-1 font-medium text-miss">
                        <span aria-hidden="true">✕ </span>({s.caseMiss})
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1 text-right font-mono tabular-nums">{c.score ?? '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function ProviderCard({ run, history }: { run: EvalRun; history: EvalRun[] }) {
  const m = run.metrics;
  const served = Object.entries(m.modelsServed ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([model, n]) => `${model} ×${n}`)
    .join(', ');
  return (
    <article className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3 font-mono text-xs text-muted-foreground sm:px-5">
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-border-strong" />
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-border-strong" />
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-border-strong" />
          <span className="ml-2 truncate">{run.model}</span>
        </span>
        <span className="shrink-0">{s.runDate(date(run.created_at))}</span>
      </div>
      <div className="grid gap-5 p-4 sm:p-5">
        <div>
          <h3 className="text-lg font-semibold tracking-[-0.02em]">{providerName(run.provider)}</h3>
          {m.cases != null ? (
            <p className="mt-1 font-mono text-xs text-muted-foreground">{s.runMeta(m.cases, m.labeledCases ?? m.cases)}</p>
          ) : null}
        </div>
        <MetricList run={run} />
        <Trend provider={run.provider} runs={history} />
        <CaseTable run={run} />
        <p className="font-mono text-xs break-words text-muted-foreground">
          {s.versions(run.prompt_version, run.dataset_version)}
          {served ? (
            <>
              <br />
              {s.servedBy(served)}
            </>
          ) : null}
        </p>
      </div>
    </article>
  );
}

export default async function EvalsPage() {
  const rc = await getRequestContext();
  const data = await listEvalRuns(rc.env);
  const latest = data.ok ? latestPerProvider(data.runs) : [];

  return (
    <PageShell>
      <section className="max-w-2xl">
        <h1 className="text-4xl leading-[1.05] font-bold tracking-[-0.035em] text-balance sm:text-5xl">{s.heading}</h1>
        <p className="mt-5 text-[17px] leading-relaxed text-pretty text-muted-foreground">{s.intro}</p>
      </section>

      <section aria-labelledby="latest-runs" className="mt-12 sm:mt-16">
        <h2 id="latest-runs" className="text-[28px] leading-tight font-semibold tracking-[-0.03em]">
          {s.latestTitle}
        </h2>
        {!data.ok ? (
          <p className="mt-6 rounded-xl border bg-card p-5 font-mono text-sm text-muted-foreground">{s.unavailable}</p>
        ) : latest.length === 0 ? (
          <p className="mt-6 rounded-xl border bg-card p-5 font-mono text-sm text-muted-foreground">{s.empty}</p>
        ) : (
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {latest.map((run) => (
              <ProviderCard key={run.id} run={run} history={data.runs.filter((r) => r.provider === run.provider)} />
            ))}
          </div>
        )}
      </section>

      <div className="mt-16 grid gap-16 border-t pt-16 sm:mt-24 sm:pt-24">
        <section aria-labelledby="glossary" className="max-w-3xl">
          <h2 id="glossary" className="text-[28px] leading-tight font-semibold tracking-[-0.03em]">
            {s.glossaryTitle}
          </h2>
          <dl className="mt-6 grid gap-5 text-[15px] leading-relaxed">
            {s.glossary.map((g) => (
              <div key={g.term}>
                <dt className="font-medium">{g.term}</dt>
                <dd className="mt-1 text-pretty text-muted-foreground">{g.body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="grid gap-12 md:grid-cols-2">
          <section aria-labelledby="dataset">
            <h2 id="dataset" className="text-[28px] leading-tight font-semibold tracking-[-0.03em]">
              {s.datasetTitle}
            </h2>
            <div className="mt-6 grid gap-4 text-[15px] leading-relaxed text-pretty text-muted-foreground">
              {s.dataset.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </section>

          <section aria-labelledby="limits">
            <h2 id="limits" className="text-[28px] leading-tight font-semibold tracking-[-0.03em]">
              {s.limitsTitle}
            </h2>
            <ul className="mt-6 grid list-disc gap-2.5 pl-5 text-[15px] leading-relaxed text-pretty text-muted-foreground marker:text-signal-text">
              {s.limits.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </PageShell>
  );
}
