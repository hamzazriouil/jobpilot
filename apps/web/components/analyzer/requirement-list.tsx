'use client';

// The evidence trace (docs/08-BRAND-UI.md §6.5): requirements as terminal lines. Each line has a
// key column (`must` / `nice`), a status glyph + word (✓ met · ◐ partly met · ✕ missing; status is
// never color only), the requirement, and `↳ cv/<source>: “quote”`. Lines enter as they stream
// (a scan line sweeps the window and a block cursor blinks after the last line, both hidden under
// reduced motion). Once the final result is in, the list collapses after 6 and two closing lines
// show what code did: the quote check and the score computed in code.
import { useId, useState } from 'react';
import type { AnalysisResult } from '@jobpilot/core/schemas';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { strings } from '@/lib/strings';
import type { PartialRequirement } from '@/lib/client/partial';
import { TerminalWindow } from './result-card';
import { BAND_TONE, QUIET_TEXT, STATUS_TONE, TONE_CLASSES, TONE_GLYPH } from './tone';

const COLLAPSED_COUNT = 6;

/** Key column + content column; the key column is narrower on phones. */
const LINE_GRID = 'grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-x-4';

export function RequirementList({
  requirements,
  streaming,
  result,
}: {
  requirements: PartialRequirement[];
  streaming: boolean;
  /** The server's final result, for the closing "check" and "score" lines. */
  result: AnalysisResult | null;
}) {
  const r = strings.results.requirements;
  const t = strings.results.trace;
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const canCollapse = !streaming && requirements.length > COLLAPSED_COUNT;
  const visible = canCollapse && !expanded ? requirements.slice(0, COLLAPSED_COUNT) : requirements;

  return (
    <TerminalWindow
      title={t.windowTitle}
      srTitle={r.title}
      status={
        !streaming && requirements.length > 0 ? (
          <span aria-hidden="true">{t.count(requirements.length)}</span>
        ) : null
      }
    >
      {streaming ? (
        <div
          aria-hidden="true"
          className="motion-hide pointer-events-none absolute inset-x-0 top-0 h-20 animate-scan bg-linear-to-b from-transparent via-signal/[0.06] to-transparent"
        />
      ) : null}

      <div className="grid gap-3.5 px-4 py-5 font-mono text-[13px] leading-relaxed sm:px-5 sm:text-sm">
        {requirements.length === 0 && streaming ? (
          <TraceSkeletonLines />
        ) : (
          <ul id={listId} className="grid gap-3.5">
            {visible.map((req, i) => (
              <TraceLine
                key={i}
                requirement={req}
                // The last line of a live stream may still be arriving.
                pending={streaming && !req.status}
              />
            ))}
          </ul>
        )}

        {streaming ? <CursorLine /> : null}

        {canCollapse ? (
          <div className={LINE_GRID}>
            <span aria-hidden="true" />
            <Button
              variant="ghost"
              className="-ml-3 h-10 justify-self-start px-3 font-mono text-xs text-muted-foreground hover:text-foreground"
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? r.showFewer : r.showAll(requirements.length)}
            </Button>
          </div>
        ) : null}

        {result ? <ClosingLines result={result} /> : null}
      </div>
    </TerminalWindow>
  );
}

function TraceLine({ requirement, pending }: { requirement: PartialRequirement; pending: boolean }) {
  const t = strings.results.trace;
  const r = strings.results.requirements;
  const { text, type, status, evidenceQuote, evidenceSource, note } = requirement;
  const tone = status ? STATUS_TONE[status] : 'neutral';

  return (
    <li className={cn(LINE_GRID, 'animate-trace-in')}>
      <span className={QUIET_TEXT}>{type ? r.type[type] : ''}</span>
      <div className="grid min-w-0 gap-1">
        <p className="break-words">
          {status ? (
            <span className={cn('mr-2 whitespace-nowrap', TONE_CLASSES[tone].text)}>
              <span aria-hidden="true">{TONE_GLYPH[tone]} </span>
              {t.status[status]}
              <span className="sr-only">: </span>
            </span>
          ) : (
            <span className={cn('mr-2 whitespace-nowrap', QUIET_TEXT)}>
              {pending ? t.checking : t.notChecked}
              <span className="sr-only">: </span>
            </span>
          )}
          <span className="text-foreground">{text}</span>
        </p>
        {evidenceQuote ? (
          <p className={cn('break-words', QUIET_TEXT)}>
            <span aria-hidden="true">↳ </span>
            {t.sourcePaths[evidenceSource ?? 'none']}: “{evidenceQuote}”
          </p>
        ) : null}
        {note ? (
          <p className="font-sans text-[13px] leading-relaxed break-words text-muted-foreground">
            <span aria-hidden="true" className="font-mono">
              ↳{' '}
            </span>
            {note}
          </p>
        ) : null}
      </div>
    </li>
  );
}

/** The two lines code adds after the model is done: the quote check and the score. */
function ClosingLines({ result }: { result: AnalysisResult }) {
  const t = strings.results.trace;
  const downgrades = result.evidenceDowngrades;
  // Quotes that survived the server's check: met/partly met requirements keep a quote only if it
  // was found in the CV, and the eligibility quote only if it was found in the job post. Every
  // downgrade is a quote that failed the check.
  const verified =
    result.requirements.filter((req) => req.status !== 'missing' && req.evidenceQuote).length +
    (result.eligibility.evidenceQuote ? 1 : 0);
  const total = verified + downgrades;
  const bandTone = TONE_CLASSES[BAND_TONE[result.band]];

  return (
    <div className="grid gap-3.5 border-t border-border pt-3.5">
      <div className={cn(LINE_GRID, 'animate-trace-in')}>
        <span className={QUIET_TEXT}>{t.checkKey}</span>
        <div className="grid min-w-0 gap-1">
          <p className="break-words">
            {t.evidenceVerified(verified, total)}
            <span aria-hidden="true"> · </span>
            <span className="sr-only">, </span>
            <span className={downgrades > 0 ? TONE_CLASSES.warn.text : TONE_CLASSES.good.text}>{t.dropped(downgrades)}</span>
          </p>
          {downgrades > 0 ? (
            <p className="font-sans text-[13px] leading-relaxed break-words text-muted-foreground">
              <span aria-hidden="true" className="font-mono">
                ↳{' '}
              </span>
              {strings.results.fit.downgrades(downgrades)}
            </p>
          ) : null}
        </div>
      </div>
      <div className={cn(LINE_GRID, 'animate-trace-in [animation-delay:120ms]')}>
        <span className={QUIET_TEXT}>{t.scoreKey}</span>
        <p className="min-w-0 break-words">
          {t.computedInCode}{' '}
          <span className={cn('font-medium', bandTone.text)}>
            {t.scoreValue(result.score, t.bandWords[result.band])}
          </span>
        </p>
      </div>
    </div>
  );
}

function CursorLine() {
  return (
    <div aria-hidden="true" className={LINE_GRID}>
      <span />
      <span className="motion-hide inline-block h-[1.1em] w-2 animate-blink bg-signal" />
    </div>
  );
}

function TraceSkeletonLines() {
  return (
    <div className="grid gap-3.5">
      {[0, 1, 2].map((i) => (
        <div key={i} className={LINE_GRID}>
          <Skeleton className="h-4 w-9" />
          <div className="grid gap-2">
            <Skeleton className={cn('h-4', i === 1 ? 'w-2/3' : 'w-5/6')} />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
