'use client';

// SVG ring 0–100. Only ever receives the server's final score; it animates from 0 once on mount
// (CSS transition, disabled by prefers-reduced-motion). The text equivalent is the aria-label.
import { useEffect, useState } from 'react';
import type { FitBand } from '@jobpilot/core/schemas';
import { cn } from '@/lib/utils';
import { strings } from '@/lib/strings';
import { BAND_TONE, TONE_CLASSES } from './tone';

const SIZE = 120;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function FitScoreRing({ score, band }: { score: number; band: FitBand }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(score));
    return () => cancelAnimationFrame(frame);
  }, [score]);

  const tone = TONE_CLASSES[BAND_TONE[band]];
  const bandLabel = strings.results.fit.bands[band];
  const offset = CIRCUMFERENCE * (1 - Math.min(100, Math.max(0, shown)) / 100);

  return (
    <div
      role="img"
      aria-label={strings.results.fit.scoreAriaLabel(score, bandLabel)}
      className="relative grid size-[120px] shrink-0 place-items-center"
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" strokeWidth={STROKE} className="stroke-muted" />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          className={cn('transition-[stroke-dashoffset] duration-1000 ease-out motion-reduce:transition-none', tone.stroke)}
        />
      </svg>
      <div aria-hidden="true" className="text-center">
        <span className="block font-mono text-3xl font-semibold tabular-nums">{score}</span>
        <span className="block font-mono text-[11px] text-muted-foreground">{strings.results.fit.outOf}</span>
      </div>
    </div>
  );
}

export function FitScoreRingSkeleton() {
  return (
    <div aria-hidden="true" className="relative grid size-[120px] shrink-0 place-items-center">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          className="animate-pulse stroke-muted motion-reduce:animate-none"
        />
      </svg>
    </div>
  );
}
