# 08 · Brand & UI: ApplyVerdict, "Signal"

Status: direction C ("Signal") chosen by the founder on 2026-10-24, brand name **ApplyVerdict**.
Supersedes the visual parts of 03-UI-UX.md §2 (colors, type, radius). Flows, copy tone, states and
accessibility rules in 03-UI-UX.md still apply.

## 1. Idea

The analysis is an **evidence trace**: every claim the product makes is a line with a status glyph
and the quote that proves it, streamed like a terminal. One accent color, used only for proof and
for the primary action. It should read as "an AI engineer built this carefully", not "AI wrapper".

Hero line: **An honest fit score.** / *Every claim traced to your CV.* (second line muted).

## 2. Brand

- Name: **ApplyVerdict** (one word, capital A and V). Code name stays `jobpilot` in packages/repo.
- Mark: rounded square (radius 7/28) filled with Signal lime, with an ink "trace" line
  (a flat line, a spike up, a deep dip, a recovery) – `components/brand-mark.tsx`, `app/icon.svg`.
- Wordmark: Geist 600, tracking -0.02em. "Apply" in foreground, "Verdict" in foreground too
  (no two-tone gimmick); the mark carries the color.
- Tagline (meta title, OG): "An honest verdict before you apply."

## 3. Color tokens (globals.css)

Dark is the default theme (the brand look). Light is available from the toggle; there is no
"system" mode, so screenshots and the brand stay consistent. `<html class="dark">` ships from the
server; the init script swaps to `light` if the visitor chose it.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--background` | #0A0A0B void | #FAFAF7 paper | page |
| `--card` | #111113 panel | #FFFFFF | cards, terminal windows |
| `--elevated` | #18181B | #F4F4F0 | selected tab, inputs on cards |
| `--border` | #1F1F23 | #E4E4DF | hairlines |
| `--border-strong` | #2E2E34 | #D4D4CE | inputs, outline buttons |
| `--foreground` | #EDEDEF | #0A0A0B | text |
| `--muted-foreground` | #A1A1AA | #52525B | body copy, labels |
| `--subtle` | #6E6E78 | #71717A | trace keys, meta, 2nd hero line |
| `--signal` | #C6F432 | #C6F432 | fills: primary button, gauge arc, live dot, cursor |
| `--signal-foreground` | #0A0A0B | #0A0A0B | text on signal fills |
| `--signal-text` | #C6F432 | #3F6212 | "met / eligible / proof" text and icons |
| `--partial` | #FFB020 | #B45309 | partial, unclear, stretch |
| `--miss` | #FF6B6B | #B91C1C | missing, not eligible, long shot |

Rules: lime only means "verified / positive / do this". Never decorative gradients except the faint
scan line. Status is never color alone: glyph + word (✓ met, ◐ partial, ✕ missing).

## 4. Type

- **Geist** (sans) for everything; **Geist Mono** for the trace, labels, numbers, meta, pills.
- Hero h1: 44px mobile → 84px desktop, weight 700, line-height .98, tracking -0.045em, `text-balance`.
- Section h2: 28–36px, 600, tracking -0.03em. Labels: mono 12px uppercase tracking 0.08em, subtle.
- Numbers: `tabular-nums`.

## 5. Shape & layout

- Radius: cards 14px, inputs/buttons 8px, pills full.
- Content width `max-w-6xl`, 16px gutter on phones, 24px+ on desktop. No horizontal scroll at 360px.
- Terminal window chrome: 3 grey dots + mono title + right status ("● streaming", "✓ done").
- Hairline borders, no shadows in dark; a very soft shadow on cards in light.

## 6. Page structure (landing `/`)

1. Header: mark + wordmark, nav (How it works · Evals · Pricing), theme toggle, primary CTA
   "Analyze free" (scrolls to the form). Nav collapses to CTA + toggle on phones.
2. Hero (centered): evals pill (live dot, real numbers, links to /evals), h1, subtitle, two CTAs
   ("Try a sample run" runs the real sample; "Use my CV" scrolls to the form), trust line in mono.
3. **Demo trace** (decorative sample, labeled "sample run"): terminal window streaming trace lines
   + gauge card counting to the sample's score + drafts card. Quotes must exist in the real
   SAMPLE_CV/SAMPLE_JOB (honesty: no invented demo claims). Loops while in view; static final frame
   with reduced motion. `aria-hidden` with a one-sentence sr-only description.
4. Analyzer form ("Run it on your CV"): CV and job post side by side (stacked on phones), country,
   remember-CV, Analyze button (signal), quota hint. Sticky action bar on phones (as today).
5. Results (real data, same components the demo is drawn from):
   - Header row: job title · company, run status in mono.
   - Verdict strip: eligibility line ("✓ eligible from Morocco · quote") + fit gauge card.
   - Evidence trace: requirements as trace lines (key `must`/`nice`, glyph + status, requirement,
     `↳ cv/<source>: "quote"`), lines enter as they stream, scan line while streaming.
   - Close-the-gap, red flags, then "check: evidence verified n/m quotes · k dropped" and
     "score: computed in code → 77 · good" as the final trace lines.
   - Drafts card: tabs, text, footer "honesty check · 0 flags" + Copy (signal).
6. How it works (3 steps with mono numbers 01–03), What we check, Privacy line, FAQ, footer.

## 7. Motion

| Moment | Motion | Duration |
|---|---|---|
| Trace line appears | fade + 6px slide from left | 280ms ease-out |
| Streaming | scan-line gradient sweeps the trace window; blinking block cursor on last line | 3.5s loop / 1s steps |
| Score arrives | gauge arc + number count up from 0 (cubic ease-out); only from the server's score | 900ms |
| Eligibility verdict | glyph pops (scale .8→1) | 200ms |
| Live dot | soft pulse ring | 2s loop |
| Copy | button label → "Copied ✓" | 1.5s |
| Hover | border-strong + 1px lift on cards/buttons | 150ms |

`prefers-reduced-motion: reduce` → no slides, scan, pulse, cursor blink or count-up; final values
render at once. Animations use transform/opacity only.

## 8. Other pages

/evals: terminal styling for metric tiles (mono numbers, signal for pass, partial/miss for weak),
same header/footer. /pricing and legal pages: inherit tokens; pricing cards use 14px cards and the
signal button for the main plan. OG image (1200×630): void background, mark + wordmark, h1, a
three-line mini trace, and the evals pill.

## 9. Done when

- Light and dark both pass WCAG AA for text; focus rings visible (signal, 3px).
- 360px, 768px, 1280px look intentional. Reduced motion verified.
- `?mock=1` scenarios (default, flags, slow, error, draft_error, quota, busy, bad_input) all render
  in the new style. Tests and tsc pass.
