'use client';

// /feed client (docs/03-UI-UX.md §4.5, W15): today's matches, filters, dismiss/undo, earlier days.
// Cards without an analysis are analyzed one at a time (the analyze route allows one run per user
// at a time), first the `autoAnalyze` free ones automatically, then any card on request. "New today"
// cards (jobs added after the matches were picked) are only analyzed on request and can't be
// dismissed (they have no daily_matches row).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnalyzeResultEvent } from '@jobpilot/core/schemas';
import { postSse, StreamError } from '@/lib/client/stream';
import { feedAnalysisFrom, matchesFilters, type BandFilter, type EligibilityFilter, type FeedItem, type FeedStatus } from '@/lib/feed';
import { strings } from '@/lib/strings';
import { buttonVariants } from '@/components/ui/button';
import { LABEL_CLASS } from '@/components/analyzer/tone';
import { FeedCard, type RunState } from './feed-card';

const BAND_FILTERS: BandFilter[] = ['all', 'strong', 'good', 'stretch', 'long_shot', 'pending'];
const ELIGIBILITY_FILTERS: EligibilityFilter[] = ['all', 'can_apply'];
const SELECT_CLASS =
  'h-9 rounded-md border border-border-strong bg-card px-2 text-sm text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

const dateFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' });

export function FeedView({
  items: initial,
  fresh: initialFresh,
  status,
  today,
  autoAnalyze,
  loadFailed,
}: {
  items: FeedItem[];
  fresh: FeedItem[];
  status: FeedStatus | null;
  today: string;
  autoAnalyze: number;
  loadFailed: boolean;
}) {
  const s = strings.feed;
  const [items, setItems] = useState(initial);
  const [fresh, setFresh] = useState(initialFresh);
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [band, setBand] = useState<BandFilter>('all');
  const [eligibility, setEligibility] = useState<EligibilityFilter>('all');

  // ── analysis queue (one run at a time) ──
  const queue = useRef<string[]>([]);
  const running = useRef(false);
  const started = useRef(false);

  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    while (queue.current.length > 0) {
      const jobId = queue.current.shift()!;
      setRuns((r) => ({ ...r, [jobId]: 'running' }));
      try {
        const { result } = await postSse(`/api/jobs/${jobId}/analyze`, {}, { resultSchema: AnalyzeResultEvent });
        const analysis = feedAnalysisFrom({
          score: result.score,
          band: result.band,
          verdict: result.eligibility.verdict,
          requirements: result.requirements,
          gaps: result.gaps,
        });
        const withAnalysis = (list: FeedItem[]) => list.map((it) => (it.jobId === jobId ? { ...it, analysis } : it));
        setItems(withAnalysis);
        setFresh(withAnalysis);
        setRuns((r) => ({ ...r, [jobId]: 'idle' }));
      } catch (err) {
        const code = err instanceof StreamError ? err.code : 'internal';
        setRuns((r) => ({ ...r, [jobId]: { failed: err instanceof Error ? err.message : s.card.analyzeFailed } }));
        // Out of quota or providers busy: the rest would fail the same way.
        if (code === 'quota_exceeded' || code === 'busy') {
          const rest = queue.current.splice(0);
          setRuns((r) => ({ ...r, ...Object.fromEntries(rest.map((id) => [id, 'idle' as const])) }));
        }
      }
    }
    running.current = false;
  }, [s.card.analyzeFailed]);

  const enqueue = useCallback(
    (jobIds: string[]) => {
      const fresh = jobIds.filter((id) => !queue.current.includes(id));
      if (fresh.length === 0) return;
      queue.current.push(...fresh);
      setRuns((r) => ({ ...r, ...Object.fromEntries(fresh.map((id) => [id, 'queued' as const])) }));
      void pump();
    },
    [pump],
  );

  useEffect(() => {
    if (started.current) return; // StrictMode runs effects twice in dev
    started.current = true;
    const ids = initial
      .filter((it) => it.matchDate === today && !it.dismissed && !it.analysis)
      .slice(0, autoAnalyze)
      .map((it) => it.jobId);
    enqueue(ids);
  }, [initial, today, autoAnalyze, enqueue]);

  // ── dismiss / undo (optimistic) ──
  const setDismissed = useCallback(async (jobId: string, dismissed: boolean) => {
    setItems((list) => list.map((it) => (it.jobId === jobId ? { ...it, dismissed } : it)));
    const ok = await fetch(`/api/feed/${jobId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dismissed }),
    })
      .then((r) => r.ok)
      .catch(() => false);
    if (!ok) setItems((list) => list.map((it) => (it.jobId === jobId ? { ...it, dismissed: !dismissed } : it)));
  }, []);

  const visible = useMemo(() => items.filter((it) => !it.dismissed && matchesFilters(it, band, eligibility)), [items, band, eligibility]);
  const todays = visible.filter((it) => it.matchDate === today);
  const earlier = groupByDate(visible.filter((it) => it.matchDate !== today));
  const dismissed = items.filter((it) => it.dismissed);
  const todayAll = items.filter((it) => it.matchDate === today && !it.dismissed);
  const strongCount = todayAll.filter((it) => it.analysis?.band === 'strong').length;
  const freshVisible = fresh.filter((it) => matchesFilters(it, band, eligibility));
  const filtering = band !== 'all' || eligibility !== 'all';

  const renderCard = (it: FeedItem, dismissable: boolean) => (
    <FeedCard
      key={it.jobId}
      item={it}
      run={runs[it.jobId] ?? 'idle'}
      onAnalyze={() => enqueue([it.jobId])}
      onDismiss={dismissable ? () => void setDismissed(it.jobId, true) : undefined}
    />
  );
  const card = (it: FeedItem) => renderCard(it, true);

  return (
    <section className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className={LABEL_CLASS}>{s.today}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-[-0.03em]">{s.summary(todayAll.length, strongCount)}</h1>
          <p className="mt-2 max-w-xl text-pretty text-sm text-muted-foreground">{s.intro}</p>
          {status && <p className="mt-2 max-w-xl font-mono text-xs text-subtle">{statusText(status, today)}</p>}
        </div>
        {items.length + fresh.length > 0 && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={s.filters.label}>
            <label className="sr-only" htmlFor="feed-band">
              {s.filters.band}
            </label>
            <select id="feed-band" className={SELECT_CLASS} value={band} onChange={(e) => setBand(e.target.value as BandFilter)}>
              {BAND_FILTERS.map((b) => (
                <option key={b} value={b}>
                  {s.filters.bands[b]}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="feed-eligibility">
              {s.filters.eligibility}
            </label>
            <select
              id="feed-eligibility"
              className={SELECT_CLASS}
              value={eligibility}
              onChange={(e) => setEligibility(e.target.value as EligibilityFilter)}
            >
              {ELIGIBILITY_FILTERS.map((f) => (
                <option key={f} value={f}>
                  {s.filters.eligibilities[f]}
                </option>
              ))}
            </select>
          </div>
        )}
      </header>

      {loadFailed && (
        <p role="alert" className="text-sm text-miss">
          {s.loadFailed}
        </p>
      )}

      {items.length === 0 && fresh.length === 0 && !loadFailed ? (
        <EmptyFeed />
      ) : (
        <>
          {todays.length > 0 ? (
            <div className="grid gap-3">{todays.map(card)}</div>
          ) : filtering ? (
            <p className="text-sm text-muted-foreground">
              {s.filters.none}{' '}
              <button
                type="button"
                className="text-signal-text underline underline-offset-4"
                onClick={() => {
                  setBand('all');
                  setEligibility('all');
                }}
              >
                {s.filters.clear}
              </button>
            </p>
          ) : (
            todayAll.length === 0 && fresh.length === 0 && <EmptyFeed compact />
          )}
          {todays.length > 0 && <p className="font-mono text-xs text-subtle">{s.analyzeHint}</p>}

          {freshVisible.length > 0 && (
            <div className="grid gap-3">
              <div>
                <h2 className="text-lg font-semibold">{s.fresh.title}</h2>
                <p className="mt-1 text-sm text-pretty text-muted-foreground">{s.fresh.hint}</p>
              </div>
              {freshVisible.map((it) => renderCard(it, false))}
            </div>
          )}

          {earlier.length > 0 && (
            <details className="rounded-xl border">
              <summary className="cursor-pointer px-5 py-3 text-sm font-medium">{s.earlier}</summary>
              <div className="grid gap-6 border-t px-3 py-4 sm:px-5">
                {earlier.map(([date, group]) => (
                  <div key={date} className="grid gap-3">
                    <p className={LABEL_CLASS}>
                      {dateFmt.format(new Date(`${date}T00:00:00Z`))} · {s.earlierCount(group.length)}
                    </p>
                    {group.map(card)}
                  </div>
                ))}
              </div>
            </details>
          )}

          {dismissed.length > 0 && (
            <details className="rounded-xl border">
              <summary className="cursor-pointer px-5 py-3 text-sm font-medium">{s.dismissed(dismissed.length)}</summary>
              <ul className="divide-y border-t">
                {dismissed.map((it) => (
                  <li key={it.jobId} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="min-w-0 truncate text-muted-foreground">
                      {it.title}
                      {it.company ? ` · ${it.company}` : ''}
                    </span>
                    <button
                      type="button"
                      className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                      onClick={() => void setDismissed(it.jobId, false)}
                    >
                      {s.card.undo}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

function statusText(st: FeedStatus, today: string): string {
  const at = (iso: string) => {
    const d = new Date(iso);
    return iso.slice(0, 10) === today ? timeFmt.format(d) : `${dateFmt.format(d)}, ${timeFmt.format(d)}`;
  };
  return strings.feed.status({ checkedAt: at(st.lastCheckedAt), newToday: st.newToday, open: st.open, nextAt: at(st.nextAt) });
}

function groupByDate(items: FeedItem[]): Array<[string, FeedItem[]]> {
  const groups = new Map<string, FeedItem[]>();
  for (const it of items) groups.set(it.matchDate, [...(groups.get(it.matchDate) ?? []), it]);
  return [...groups.entries()];
}

function EmptyFeed({ compact = false }: { compact?: boolean }) {
  const e = strings.feed.empty;
  return (
    <div className="rounded-xl border bg-card px-5 py-8 sm:px-8">
      <h2 className="text-xl font-semibold">{e.title}</h2>
      <p className="mt-2 max-w-xl text-pretty text-muted-foreground">{e.body}</p>
      {!compact && (
        <ul className="mt-4 grid gap-1 text-sm text-muted-foreground">
          {e.tips.map((t) => (
            <li key={t}>· {t}</li>
          ))}
        </ul>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        <a href="/jobs/new" className={buttonVariants()}>
          {e.action} →
        </a>
        <a href="/onboarding" className={buttonVariants({ variant: 'outline' })}>
          {e.editProfile}
        </a>
      </div>
    </div>
  );
}
