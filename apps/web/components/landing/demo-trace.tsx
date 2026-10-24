'use client';

// Landing "sample run" (docs/08-BRAND-UI.md §6.3, §7): an evidence-trace terminal that streams the
// real sample's lines, a fit gauge counting up to the sample's score, and a drafts card.
// Decorative: aria-hidden with an sr-only sentence. Content comes from lib/landing/demo-trace.ts,
// which is tested against the real sample in packages/core.
//
// Motion: lines enter ~350ms apart, the gauge counts after the last line (cubic ease-out, 900ms),
// the final frame holds ~4s, then the run restarts. It only runs while in view and while the tab is
// visible. With prefers-reduced-motion the final frame is shown statically.
import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  DEMO_BAND,
  DEMO_COVER_LETTER,
  DEMO_EVIDENCE,
  DEMO_HONESTY_FLAGS,
  DEMO_LINES,
  DEMO_MUST,
  DEMO_SCORE,
  type DemoLine,
  type DemoStatus,
} from '@/lib/landing/demo-trace';
import { strings } from '@/lib/strings';
import { cn } from '@/lib/utils';

const N = DEMO_LINES.length;
const FIRST_LINE_MS = 300;
const STAGGER_MS = 350;
const COUNT_DELAY_MS = 280;
const COUNT_MS = 900;
const HOLD_MS = 4000;
/** The server renders the final frame; show it briefly before the first replay so it doesn't snap backwards. */
const FIRST_HOLD_MS = 1500;
const FADE_MS = 300;

/** idle = static final frame (server render, reduced motion, before the first run). */
type Phase = 'idle' | 'lines' | 'count' | 'hold' | 'fade';

const RING_R = 62;
const RING_C = 2 * Math.PI * RING_R;

const STATUS_STYLE: Record<DemoStatus, { glyph: string; className: string }> = {
  eligible: { glyph: '✓', className: 'text-signal-text' },
  met: { glyph: '✓', className: 'text-signal-text' },
  partial: { glyph: '◐', className: 'text-partial' },
  missing: { glyph: '✕', className: 'text-miss' },
};

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return reduced;
}

/** True while the element is (partly) on screen and the tab is visible. */
function useActive(ref: RefObject<HTMLElement | null>): boolean {
  const [inView, setInView] = useState(false);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setInView(entry?.isIntersecting ?? false), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return inView && visible;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function DemoTrace() {
  const d = strings.demo;
  const rootRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const active = useActive(rootRef);
  const [phase, setPhase] = useState<Phase>('idle');
  const [step, setStep] = useState(N); // number of visible lines
  const [score, setScore] = useState(DEMO_SCORE);

  // Reduced motion (also when switched on mid-run): final frame, no loop.
  useEffect(() => {
    if (!reduced) return;
    setPhase('idle');
    setStep(N);
    setScore(DEMO_SCORE);
  }, [reduced]);

  useEffect(() => {
    if (reduced || !active) return;
    if (phase === 'idle') {
      // First run: hold the static final frame a moment, then fade and stream from the top.
      const t = window.setTimeout(() => setPhase('fade'), FIRST_HOLD_MS);
      return () => window.clearTimeout(t);
    }
    if (phase === 'lines') {
      const t = window.setTimeout(
        () => {
          const next = step + 1;
          setStep(next);
          if (next >= N) setPhase('count');
        },
        step === 0 ? FIRST_LINE_MS : STAGGER_MS,
      );
      return () => window.clearTimeout(t);
    }
    if (phase === 'count') {
      let raf = 0;
      let start = 0;
      const tick = (now: number) => {
        if (!start) start = now;
        const p = Math.min(1, (now - start) / COUNT_MS);
        setScore(Math.round(easeOutCubic(p) * DEMO_SCORE));
        if (p < 1) raf = requestAnimationFrame(tick);
        else setPhase('hold');
      };
      const t = window.setTimeout(() => {
        raf = requestAnimationFrame(tick);
      }, COUNT_DELAY_MS);
      return () => {
        window.clearTimeout(t);
        cancelAnimationFrame(raf);
      };
    }
    if (phase === 'hold') {
      const t = window.setTimeout(() => setPhase('fade'), HOLD_MS);
      return () => window.clearTimeout(t);
    }
    // fade → restart
    const t = window.setTimeout(() => {
      setStep(0);
      setScore(0);
      setPhase('lines');
    }, FADE_MS);
    return () => window.clearTimeout(t);
  }, [reduced, active, phase, step]);

  const streaming = phase === 'lines' || phase === 'count';
  const finished = phase === 'idle' || phase === 'hold' || phase === 'fade';
  const cursorAt = Math.max(0, Math.min(step, N) - 1);
  const offset = RING_C * (1 - score / 100);

  return (
    <section aria-label={d.sectionAriaLabel} className="mt-14 sm:mt-20">
      <p className="sr-only">{d.srDescription}</p>
      <div ref={rootRef} aria-hidden="true" className="grid gap-4 sm:gap-5 lg:grid-cols-12">
        {/* Terminal window */}
        <div className="relative overflow-hidden rounded-xl border bg-card lg:col-span-7">
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3 font-mono text-xs text-subtle sm:px-[18px] sm:py-3.5">
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full bg-border-strong" />
              <span className="size-2.5 shrink-0 rounded-full bg-border-strong" />
              <span className="size-2.5 shrink-0 rounded-full bg-border-strong" />
              <span className="ml-2 truncate">{d.windowTitle}</span>
            </span>
            <span className="shrink-0 text-signal-text">{streaming ? d.streaming : d.done}</span>
          </div>

          {streaming ? (
            <div className="motion-hide pointer-events-none absolute inset-x-0 top-11 h-20 animate-scan bg-linear-to-b from-signal/0 via-signal/5 to-signal/0" />
          ) : null}

          <div
            className={cn(
              'flex flex-col gap-3 px-4 pt-5 pb-6 font-mono text-[13px] leading-relaxed transition-opacity duration-300 sm:gap-3.5 sm:px-[22px] sm:text-sm',
              phase === 'fade' && 'opacity-0',
            )}
          >
            {DEMO_LINES.map((line, i) => (
              <div
                key={i}
                className={cn(
                  'grid grid-cols-[72px_minmax(0,1fr)] gap-3 sm:grid-cols-[96px_minmax(0,1fr)] sm:gap-3.5',
                  i < step ? 'animate-trace-in' : 'opacity-0',
                )}
              >
                <span className="text-subtle">{lineKey(line)}</span>
                <span className="min-w-0 break-words">
                  <LineBody line={line} />
                  {i === cursorAt && (streaming || finished) ? (
                    <span className="ml-1.5 inline-block h-[1.05em] w-[0.6em] translate-y-[0.18em] animate-blink bg-signal" />
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Gauge + drafts */}
        <div className="grid content-start gap-4 sm:grid-cols-2 sm:gap-5 lg:col-span-5 lg:grid-cols-1">
          <div className="flex items-center gap-5 rounded-xl border bg-card p-5 sm:gap-6 sm:p-[26px]">
            <svg viewBox="0 0 148 148" className="size-28 shrink-0 sm:size-[148px]">
              <circle cx="74" cy="74" r={RING_R} fill="none" className="stroke-border" strokeWidth="10" />
              <circle
                cx="74"
                cy="74"
                r={RING_R}
                fill="none"
                className="stroke-signal"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={RING_C.toFixed(1)}
                strokeDashoffset={offset.toFixed(1)}
                transform="rotate(-90 74 74)"
                opacity={score === 0 ? 0 : 1}
              />
              <text
                x="74"
                y="88"
                textAnchor="middle"
                className="fill-foreground font-sans tabular-nums"
                fontWeight="700"
                fontSize="40"
              >
                {score}
              </text>
            </svg>
            <div className="flex min-w-0 flex-col gap-2">
              <span className="font-mono text-xs tracking-[0.08em] text-subtle">{d.fitLabel}</span>
              <span
                className={cn(
                  'text-2xl font-semibold tracking-[-0.02em] transition-opacity duration-300 sm:text-[30px] sm:leading-tight',
                  finished ? 'opacity-100' : 'opacity-0',
                )}
              >
                {d.bands[DEMO_BAND]}
              </span>
              <span className="text-sm leading-normal text-muted-foreground">
                {d.mustSummary(DEMO_MUST.met, DEMO_MUST.total)} {d.rubricNote}
              </span>
            </div>
          </div>

          <div className="hidden flex-col gap-3 rounded-xl border bg-card px-6 py-[22px] sm:flex">
            <div className="flex flex-wrap gap-1.5">
              {d.draftTabs.map((tab, i) => (
                <div
                  key={tab}
                  className={cn(
                    'flex min-h-10 items-center rounded-md border px-3 text-[13px] font-medium',
                    i === 0 ? 'border-border-strong bg-elevated text-foreground' : 'border-transparent text-muted-foreground',
                  )}
                >
                  {tab}
                </div>
              ))}
            </div>
            <p className="line-clamp-3 text-[15px] leading-relaxed text-foreground/85">{DEMO_COVER_LETTER}</p>
            <div className="flex items-center justify-between gap-3 font-mono text-xs text-muted-foreground">
              <span>{d.honestyFooter(DEMO_HONESTY_FLAGS)}</span>
              <div className="flex min-h-10 items-center rounded-md bg-signal px-3.5 font-sans text-[13px] font-semibold text-signal-foreground">
                {d.copy}
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-4 text-center font-mono text-xs text-muted-foreground">{d.caption}</p>
    </section>
  );
}

function lineKey(line: DemoLine): string {
  return line.kind === 'claim' ? line.key : line.kind;
}

function LineBody({ line }: { line: DemoLine }) {
  const d = strings.demo;
  if (line.kind === 'check') {
    return (
      <>
        {d.checkLine(DEMO_EVIDENCE.verified, DEMO_EVIDENCE.total)}
        <span className="text-signal-text">{d.dropped(DEMO_EVIDENCE.dropped)}</span>
      </>
    );
  }
  if (line.kind === 'score') {
    return (
      <>
        {d.scoreLine}
        <span className="font-medium text-foreground">
          {DEMO_SCORE} · {strings.evals.bands[DEMO_BAND]}
        </span>
      </>
    );
  }
  const st = STATUS_STYLE[line.status];
  return (
    <>
      <span className={st.className}>
        {st.glyph} {d.status[line.status]}
      </span>{' '}
      {line.text}
      {line.note ? <span className="text-muted-foreground"> · {line.note}</span> : null}
      {line.quote ? (
        <span className="mt-0.5 block text-muted-foreground">
          ↳ {line.quote.label}: “{line.quote.text}”
        </span>
      ) : null}
    </>
  );
}
