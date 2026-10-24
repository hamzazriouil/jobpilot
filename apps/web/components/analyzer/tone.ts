// Semantic colors (docs/03-UI-UX.md §2): one place, so every verdict/status/band looks the same.
// Text uses the 700 shade in light mode (600 is below WCAG AA 4.5:1 on white for small text);
// icons, borders and the ring use 600 / 400, which only need 3:1.
import type { EligibilityVerdict, FitBand, RequirementStatus } from '@jobpilot/core/schemas';

export type Tone = 'good' | 'warn' | 'bad' | 'neutral';

export const TONE_CLASSES: Record<
  Tone,
  { text: string; icon: string; border: string; surface: string; stroke: string }
> = {
  good: {
    text: 'text-emerald-700 dark:text-emerald-400',
    icon: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-600 dark:border-emerald-400',
    surface: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900',
    stroke: 'stroke-emerald-600 dark:stroke-emerald-400',
  },
  warn: {
    text: 'text-amber-700 dark:text-amber-400',
    icon: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-600 dark:border-amber-400',
    surface: 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900',
    stroke: 'stroke-amber-600 dark:stroke-amber-400',
  },
  bad: {
    text: 'text-rose-700 dark:text-rose-400',
    icon: 'text-rose-600 dark:text-rose-400',
    border: 'border-rose-600 dark:border-rose-400',
    surface: 'bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-900',
    stroke: 'stroke-rose-600 dark:stroke-rose-400',
  },
  neutral: {
    text: 'text-muted-foreground',
    icon: 'text-zinc-500 dark:text-zinc-400',
    border: 'border-zinc-300 dark:border-zinc-600',
    surface: 'bg-muted/40',
    stroke: 'stroke-zinc-400 dark:stroke-zinc-500',
  },
};

export const VERDICT_TONE: Record<EligibilityVerdict, Tone> = { eligible: 'good', unclear: 'warn', not_eligible: 'bad' };
export const STATUS_TONE: Record<RequirementStatus, Tone> = { met: 'good', partial: 'warn', missing: 'bad' };
export const BAND_TONE: Record<FitBand, Tone> = { strong: 'good', good: 'warn', stretch: 'warn', long_shot: 'bad' };
