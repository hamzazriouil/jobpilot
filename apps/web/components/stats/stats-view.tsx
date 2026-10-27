import type { ReactNode } from 'react';
import { LABEL_CLASS } from '@/components/analyzer/tone';
import { buttonVariants } from '@/components/ui/button';
import { STATS_MIN_APPLICATIONS, type Insight, type RateRow, type Stats } from '@/lib/stats';
import { strings } from '@/lib/strings';
import { cn } from '@/lib/utils';

// /stats body (docs/03-UI-UX.md §4.9, W17), shared by the page and the dev preview. Server
// component: plain HTML bars, no chart library. `stats` null = the load failed.

const pct = (x: number) => Math.round(x * 100);

export function StatsView({ stats }: { stats: Stats | null }) {
  const s = strings.stats;
  return (
    <section className="grid gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-[-0.03em]">{s.title}</h1>
        <p className="mt-2 max-w-xl text-sm text-pretty text-muted-foreground">{s.intro}</p>
      </header>

      {!stats ? (
        <p role="alert" className="text-sm text-miss">
          {s.loadFailed}
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label={s.kpis.sent} value={String(stats.sent)} />
            <Kpi label={s.kpis.responseRate} value={stats.sent ? `${pct(stats.responseRate)}%` : '–'} />
            <Kpi label={s.kpis.interviewRate} value={stats.sent ? `${pct(stats.interviewRate)}%` : '–'} />
            <Kpi label={s.kpis.avgDays} value={stats.avgDaysToReply === null ? '–' : String(stats.avgDaysToReply)} />
          </dl>

          {stats.sent < STATS_MIN_APPLICATIONS ? (
            <div className="rounded-xl border bg-card px-5 py-6">
              <p className="max-w-xl text-pretty text-muted-foreground">{s.notEnough(stats.sent, STATS_MIN_APPLICATIONS)}</p>
              <a href="/tracker" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-4')}>
                {strings.tracker.panel.openTracker} →
              </a>
            </div>
          ) : (
            <>
              {stats.insight && <p className="max-w-2xl rounded-xl border border-signal-text/30 bg-signal/10 px-5 py-4 text-pretty">{insightText(stats.insight)}</p>}

              <Panel title={s.funnel}>
                {(['sent', 'replied', 'interviewing', 'offers'] as const).map((k) => (
                  <Bar key={k} label={s.funnelSteps[k]} value={stats[k]} share={stats.sent ? stats[k] / stats.sent : 0} text={String(stats[k])} />
                ))}
              </Panel>

              <div className="grid gap-6 md:grid-cols-2">
                <Panel title={s.byBand}>
                  <Rates rows={stats.byBand} label={(k) => s.bands[k]} />
                </Panel>
                <Panel title={s.byChannel}>
                  <Rates rows={stats.byChannel} label={(k) => s.channels[k]} />
                </Panel>
              </div>
            </>
          )}
          <p className="max-w-2xl font-mono text-xs text-subtle">{s.definitions}</p>
        </>
      )}
    </section>
  );
}

function insightText(i: Insight): string {
  const t = strings.stats.insight;
  const name = (dim: 'band' | 'channel', key: string) =>
    dim === 'band' ? strings.stats.bands[key as keyof typeof strings.stats.bands] : strings.stats.channels[key as keyof typeof strings.stats.channels];
  switch (i.kind) {
    case 'ratio':
      return t.ratio(t.dims[i.dimension], name(i.dimension, i.best), name(i.dimension, i.worst), i.ratio);
    case 'only':
      return t.only(t.dims[i.dimension], name(i.dimension, i.best), name(i.dimension, i.worst), pct(i.bestRate));
    case 'no_replies':
      return t.noReplies(i.sent);
    case 'rate':
      return t.rate(pct(i.rate));
  }
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-4">
      <dt className={LABEL_CLASS}>{label}</dt>
      <dd className="mt-2 font-mono text-3xl font-semibold">{value}</dd>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border bg-card px-4 py-4 sm:px-5">
      <h2 className={LABEL_CLASS}>{title}</h2>
      <div className="mt-4 grid gap-3">{children}</div>
    </section>
  );
}

function Bar({ label, value, share, text }: { label: string; value: number; share: number; text: string }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)_auto] items-center gap-3 text-sm">
      <span className="truncate text-muted-foreground">{label}</span>
      <span className="h-2.5 overflow-hidden rounded-full bg-elevated" aria-hidden>
        <span className="block h-full rounded-full bg-signal" style={{ width: `${Math.max(value > 0 ? 2 : 0, Math.round(share * 100))}%` }} />
      </span>
      <span className="text-right font-mono text-xs">{text}</span>
    </div>
  );
}

function Rates<K extends string>({ rows, label }: { rows: RateRow<K>[]; label: (k: K) => string }) {
  return rows.map((r) => (
    <Bar key={r.key} label={label(r.key)} value={r.replied} share={r.rate} text={`${pct(r.rate)}% · ${strings.stats.rateRow(r.replied, r.sent)}`} />
  ));
}
