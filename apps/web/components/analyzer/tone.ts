// Semantic colors (docs/08-BRAND-UI.md §3): one place, so every verdict/status/band looks the same.
// good = Signal (proof), warn = Partial, bad = Miss. The `-text` tokens are AA on both themes.
import type { EligibilityVerdict, FitBand, RequirementStatus } from '@jobpilot/core/schemas';

export type Tone = 'good' | 'warn' | 'bad' | 'neutral';

export const TONE_CLASSES: Record<
  Tone,
  { text: string; icon: string; border: string; surface: string; stroke: string }
> = {
  good: {
    text: 'text-signal-text',
    icon: 'text-signal-text',
    border: 'border-signal-text',
    surface: 'bg-signal/10 border-signal-text/30',
    stroke: 'stroke-signal',
  },
  warn: {
    text: 'text-partial',
    icon: 'text-partial',
    border: 'border-partial',
    surface: 'bg-partial/10 border-partial/30',
    stroke: 'stroke-partial',
  },
  bad: {
    text: 'text-miss',
    icon: 'text-miss',
    border: 'border-miss',
    surface: 'bg-miss/10 border-miss/30',
    stroke: 'stroke-miss',
  },
  neutral: {
    text: 'text-muted-foreground',
    icon: 'text-subtle',
    border: 'border-border-strong',
    surface: 'bg-elevated/60 border-border-strong',
    stroke: 'stroke-subtle',
  },
};

/** Status glyphs (always paired with a word, docs/08-BRAND-UI.md §3). Decorative: render aria-hidden. */
export const TONE_GLYPH: Record<Tone, string> = { good: '✓', warn: '◐', bad: '✕', neutral: '·' };

/** Quiet text for trace keys, quotes, labels and meta (`--subtle` is AA on both themes' cards). */
export const QUIET_TEXT = 'text-subtle';

/** Mono 12px uppercase label (docs/08-BRAND-UI.md §4). */
export const LABEL_CLASS = `font-mono text-xs font-medium tracking-[0.08em] uppercase ${QUIET_TEXT}`;

export const VERDICT_TONE: Record<EligibilityVerdict, Tone> ={ eligible: 'good', unclear: 'warn', not_eligible: 'bad' };
export const STATUS_TONE: Record<RequirementStatus, Tone> = { met: 'good', partial: 'warn', missing: 'bad' };
export const BAND_TONE: Record<FitBand, Tone> = { strong: 'good', good: 'good', stretch: 'warn', long_shot: 'bad' };
