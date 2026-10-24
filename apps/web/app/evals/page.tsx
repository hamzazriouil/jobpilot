import { PageShell } from '@/components/legal/legal-page';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getRequestContext } from '@/lib/server/env';
import { latestPerProvider, listEvalRuns, type EvalRun } from '@/lib/server/eval-runs';
import { pageMetadata } from '@/lib/site';
import { strings } from '@/lib/strings';

// Public eval results (docs/05-ARCHITECTURE.md §13). Server component, no client JS.
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

function MetricList({ run }: { run: EvalRun }) {
  const m = run.metrics;
  const rows: Array<[string, string]> = [
    [s.metrics.eligibilityAcc, pct(m.eligibilityAcc)],
    [s.metrics.bandAcc, pct(m.bandAcc)],
    [s.metrics.bandWithin1, pct(m.bandWithin1)],
    [
      s.metrics.injection,
      m.injectionCases ? s.ofTotal(m.injectionPassed ?? 0, m.injectionCases) : s.notAvailable,
    ],
    [s.metrics.schemaValid, pct(m.schemaValid)],
    [s.metrics.repairRate, pct(m.repairRate)],
    [s.metrics.downgradeRate, pct(m.downgradeRate)],
    [s.metrics.honestyFlagRate, pct(m.honestyFlagRate)],
    [s.metrics.latency, `${secs(m.p50ms)} / ${secs(m.p95ms)}`],
    [s.metrics.draftLatency, `${secs(m.draftP50ms)} / ${secs(m.draftP95ms)}`],
    [s.metrics.cost, m.costPerCase == null ? s.notAvailable : s.costValue(m.costPerCase)],
    [s.metrics.errors, m.calls != null ? s.ofTotal(m.errors ?? 0, m.calls) : s.notAvailable],
  ];
  return (
    <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[1fr_auto]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="font-mono tabular-nums sm:text-right">{v}</dd>
        </div>
      ))}
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
    return <p className="text-xs text-muted-foreground">{s.trendSingle}</p>;
  }
  const W = 240;
  const H = 56;
  const pad = 6;
  const x = (i: number) => pad + (i * (W - 2 * pad)) / (points.length - 1);
  const y = (v: number) => H - pad - v * (H - 2 * pad);
  const label = s.trendAriaLabel(providerName(provider), points.map((p) => s.trendPoint(p.date, pct(p.value))).join(', '));
  return (
    <figure className="grid gap-1">
      <figcaption className="text-xs text-muted-foreground">{s.trendTitle}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-14 w-full max-w-60 text-primary" role="img" aria-label={label}>
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
    <details className="group rounded-md border px-3 py-2">
      <summary className="cursor-pointer list-none rounded-sm text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="mr-2 inline-block font-mono text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none">
          ›
        </span>
        {s.casesTitle}
      </summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-xs">
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
                    {miss ? <span className="ml-1 font-medium text-destructive">({s.caseMiss})</span> : null}
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
    <Card className="gap-5">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg">{providerName(run.provider)}</CardTitle>
          <Badge variant="secondary" className="font-mono">
            {run.model}
          </Badge>
        </div>
        <CardDescription>
          {s.runDate(date(run.created_at))}
          {m.cases != null ? ` · ${s.runMeta(m.cases, m.labeledCases ?? m.cases)}` : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
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
      </CardContent>
    </Card>
  );
}

export default async function EvalsPage() {
  const rc = await getRequestContext();
  const data = await listEvalRuns(rc.env);
  const latest = data.ok ? latestPerProvider(data.runs) : [];

  return (
    <PageShell>
      <section className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{s.heading}</h1>
        <p className="mt-4 text-pretty text-muted-foreground">{s.intro}</p>
      </section>

      <section aria-labelledby="latest-runs" className="mt-10">
        <h2 id="latest-runs" className="text-xl font-semibold tracking-tight">
          {s.latestTitle}
        </h2>
        {!data.ok ? (
          <p className="mt-4 text-sm text-muted-foreground">{s.unavailable}</p>
        ) : latest.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{s.empty}</p>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {latest.map((run) => (
              <ProviderCard key={run.id} run={run} history={data.runs.filter((r) => r.provider === run.provider)} />
            ))}
          </div>
        )}
      </section>

      <div className="mt-14 grid gap-12 border-t pt-12">
        <section aria-labelledby="glossary" className="max-w-3xl">
          <h2 id="glossary" className="text-xl font-semibold tracking-tight">
            {s.glossaryTitle}
          </h2>
          <dl className="mt-4 grid gap-4 text-sm">
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
            <h2 id="dataset" className="text-xl font-semibold tracking-tight">
              {s.datasetTitle}
            </h2>
            <div className="mt-4 grid gap-3 text-sm text-pretty text-muted-foreground">
              {s.dataset.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </section>

          <section aria-labelledby="limits">
            <h2 id="limits" className="text-xl font-semibold tracking-tight">
              {s.limitsTitle}
            </h2>
            <ul className="mt-4 grid list-disc gap-2 pl-5 text-sm text-pretty text-muted-foreground marker:text-primary">
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
