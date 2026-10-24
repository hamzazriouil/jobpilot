'use client';

// The fit gauge (docs/08-BRAND-UI.md §6.5, §7): SVG ring 0–100. It only ever receives the
// server's final score; on mount the arc and the number count up from 0 with a cubic ease-out
// over 900ms (requestAnimationFrame). Under prefers-reduced-motion the final value shows at once.
// The text equivalent (with the real score) is the aria-label.
import { useEffect, useState } from 'react';
import type { FitBand } from '@jobpilot/core/schemas';
import { cn } from '@/lib/utils';
import { strings } from '@/lib/strings';
import { BAND_TONE, QUIET_TEXT, TONE_CLASSES } from './tone';

const SIZE = 132;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const COUNT_UP_MS = 900;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function FitScoreRing({ score, band }: { score: number; band: FitBand }) {
  // Rendered only on the client after a run, so reading matchMedia here can't cause a hydration mismatch.
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? score : 0));

  useEffect(() => {
    const duration = prefersReducedMotion() ? 0 : COUNT_UP_MS;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = duration === 0 ? 1 : Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(score * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [score]);

  const tone = TONE_CLASSES[BAND_TONE[band]];
  const bandLabel = strings.results.fit.bands[band];
  const offset = CIRCUMFERENCE * (1 - Math.min(100, Math.max(0, shown)) / 100);

  return (
    <div
      role="img"
      aria-label={strings.results.fit.scoreAriaLabel(score, bandLabel)}
      className="relative grid size-[132px] shrink-0 place-items-center"
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" strokeWidth={STROKE} className="stroke-border" />
        {shown > 0 ? (
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            className={tone.stroke}
          />
        ) : null}
      </svg>
      <div aria-hidden="true" className="text-center">
        <span className="block text-[40px] leading-none font-bold tracking-tight tabular-nums">{shown}</span>
        <span className={cn('mt-1 block font-mono text-[11px]', QUIET_TEXT)}>{strings.results.fit.outOf}</span>
      </div>
    </div>
  );
}

export function FitScoreRingSkeleton() {
  return (
    <div aria-hidden="true" className="relative grid size-[132px] shrink-0 place-items-center">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          className="animate-pulse stroke-elevated motion-reduce:animate-none"
        />
      </svg>
    </div>
  );
}
