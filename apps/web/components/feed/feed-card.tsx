'use client';

// One feed card (docs/03-UI-UX.md §4.5): title · company · location, eligibility + band/score once
// analyzed, tags, posted date and source attribution with the original link (both required by the
// source terms, docs/10-SOURCES.md: normal followed links, no nofollow), the one-line summary,
// and Dismiss / Open / Analyze. "+ Track" joins with the tracker (W16).
import { daysAgo, type FeedItem } from '@/lib/feed';
import { strings } from '@/lib/strings';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { BAND_TONE, TONE_CLASSES, TONE_GLYPH, VERDICT_TONE, type Tone } from '@/components/analyzer/tone';

export type RunState = 'idle' | 'queued' | 'running' | { failed: string };

export function FeedCard({
  item,
  run,
  onAnalyze,
  onDismiss,
}: {
  item: FeedItem;
  run: RunState;
  onAnalyze: () => void;
  /** Left out for cards that can't be dismissed ("New today"). */
  onDismiss?: () => void;
}) {
  const c = strings.feed.card;
  const a = item.analysis;
  const failed = typeof run === 'object' ? run.failed : null;
  const busy = run === 'queued' || run === 'running';

  return (
    <article className="rounded-xl border bg-card px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-base leading-snug font-semibold sm:text-lg">
            <a href={`/jobs/${item.jobId}`} className="hover:underline hover:underline-offset-4">
              {item.title}
            </a>
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {[item.company, locationText(item)].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {a ? (
            <>
              <Pill tone={VERDICT_TONE[a.verdict]} label={c.verdicts[a.verdict]} />
              <Pill tone={BAND_TONE[a.band]} label={c.bandScore(c.bands[a.band], a.score)} strong />
            </>
          ) : (
            busy && <span className="font-mono text-xs text-subtle">{run === 'running' ? c.analyzing : c.queued}</span>
          )}
        </div>
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-subtle">
        {item.tags.length > 0 && <span>{item.tags.join(' · ')}</span>}
        {item.postedAt && <span>{c.posted(daysAgo(item.postedAt))}</span>}
        {item.attribution &&
          (item.attribution.href ? (
            <a href={item.attribution.href} target="_blank" rel="noopener" className="underline underline-offset-4 hover:text-foreground">
              {item.attribution.label}
            </a>
          ) : (
            <span>{item.attribution.label}</span>
          ))}
        {item.url && (
          <a href={item.url} target="_blank" rel="noopener" className="underline underline-offset-4 hover:text-foreground">
            {c.original} ↗
          </a>
        )}
      </p>

      {a && (
        <p className="mt-3 text-sm text-pretty">
          {a.mustTotal > 0 && c.mustHaves(a.mustMet, a.mustTotal)} {a.topGap && c.gap(a.topGap)}
          {!a.current && <span className="ml-1 text-subtle">{c.stale}</span>}
        </p>
      )}
      {failed && (
        <p role="alert" className="mt-3 text-sm text-miss">
          {failed}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {onDismiss && (
          <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
            {c.dismiss}
          </Button>
        )}
        {!a && !busy && (
          <Button type="button" variant="outline" size="sm" onClick={onAnalyze}>
            {failed ? c.retry : c.analyze}
          </Button>
        )}
        <a href={`/jobs/${item.jobId}`} className={buttonVariants({ size: 'sm' })}>
          {c.open} →
        </a>
      </div>
    </article>
  );
}

function locationText(item: FeedItem): string | null {
  const l = strings.feed.card.location;
  if (item.eligibilityType === 'worldwide') return l.worldwide;
  if (item.eligibilityType === 'regions' && item.allowedRegions.length > 0) {
    const shown = item.allowedRegions.slice(0, 4).join(', ');
    return l.regions(item.allowedRegions.length > 4 ? `${shown}…` : shown);
  }
  return item.locationRaw?.trim() || l.unclear;
}

function Pill({ tone, label, strong = false }: { tone: Tone; label: string; strong?: boolean }) {
  const t = TONE_CLASSES[tone];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium', t.surface, t.text, strong && 'font-mono uppercase')}>
      <span aria-hidden>{TONE_GLYPH[tone]}</span>
      {label}
    </span>
  );
}
