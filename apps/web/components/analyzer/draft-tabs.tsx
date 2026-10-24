'use client';

// Drafts (docs/03-UI-UX.md §4.2, docs/08-BRAND-UI.md §6.5): tabs for cover letter / cold DM / CV
// bullets, streamed text with a blinking cursor, and a footer with the honesty check
// ("honesty check · 0 flags" / "2 to check"), Copy (signal) for the open tab and Redo. Text the
// server couldn't find in the CV is highlighted and explained in a calm note (a prompt to check,
// not an accusation).
import { useState, type ReactNode } from 'react';
import { Info, RotateCw, TriangleAlert } from 'lucide-react';
import type { HonestyFlag } from '@jobpilot/core/schemas';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CopyButton } from '@/components/copy-button';
import { cn } from '@/lib/utils';
import { strings } from '@/lib/strings';
import { EMPTY_PARTIAL_DRAFTS, type PartialDrafts } from '@/lib/client/partial';
import type { DraftTask } from '@/lib/client/use-stream-task';
import { ResultCard } from './result-card';
import { StreamNotice } from './stream-notice';
import { QUIET_TEXT, TONE_CLASSES } from './tone';

type DraftKey = 'coverLetter' | 'coldDm' | 'cvBullets';
const TAB_ORDER: DraftKey[] = ['coverLetter', 'coldDm', 'cvBullets'];
const FLAG_KEY: Record<DraftKey, HonestyFlag['draft']> = { coverLetter: 'coverLetter', coldDm: 'coldDm', cvBullets: 'cvBullet' };

export function DraftTabs({ state, onRedo }: { state: DraftTask['state']; onRedo: () => void }) {
  const d = strings.drafts;
  const [tab, setTab] = useState<DraftKey>('coverLetter');
  if (state.status === 'idle') return null;

  const streaming = state.status === 'streaming';
  const drafts: PartialDrafts = state.status === 'done' ? state.result.drafts : (state.partial ?? EMPTY_PARTIAL_DRAFTS);
  const flags = state.status === 'done' ? state.result.honestyFlags : [];
  const live = streaming ? currentlyWriting(drafts) : null;
  const flagsFor = (key: DraftKey) => flags.filter((f) => f.draft === FLAG_KEY[key]).map((f) => f.text);
  const readyBullets = drafts.cvBullets.filter((b) => b.improved);

  // The footer's Copy copies the open tab (all bullets at once on the bullets tab).
  const copyText =
    tab === 'cvBullets' ? readyBullets.map((b) => b.improved).join('\n') : ((tab === 'coverLetter' ? drafts.coverLetter : drafts.coldDm) ?? '');
  const toCheck = new Set(flagsFor(tab)).size;

  return (
    <ResultCard title={d.title}>
      {/* Progress and "drafts ready" are announced by the analyzer's status region. */}
      <div aria-busy={streaming} className="grid gap-4">
        {state.status === 'error' ? <StreamNotice error={state.error} context="draft" onRetry={onRedo} /> : null}

        <Tabs value={tab} onValueChange={(v) => setTab(v as DraftKey)}>
          <TabsList aria-label={d.tabsAriaLabel} className="w-full sm:w-fit">
            {TAB_ORDER.map((key) => (
              <TabsTrigger key={key} value={key} className="flex-1 px-2 sm:flex-none sm:px-3">
                {d.tabs[key]}
                {flagsFor(key).length > 0 ? (
                  <>
                    <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-partial" />
                    <span className="sr-only">{d.flaggedSr}</span>
                  </>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="coverLetter" className="mt-2">
            <TextDraft text={drafts.coverLetter} flagged={flagsFor('coverLetter')} streaming={streaming} live={live === 'coverLetter'} />
          </TabsContent>
          <TabsContent value="coldDm" className="mt-2">
            <TextDraft text={drafts.coldDm} flagged={flagsFor('coldDm')} streaming={streaming} live={live === 'coldDm'} />
          </TabsContent>
          <TabsContent value="cvBullets" className="mt-2">
            <BulletDrafts bullets={readyBullets} flagged={flagsFor('cvBullets')} streaming={streaming} live={live === 'cvBullets'} />
          </TabsContent>
        </Tabs>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className={cn('font-mono text-xs', QUIET_TEXT)}>
            {state.status === 'error' ? null : (
              <>
                {d.honestyCheck}
                <span aria-hidden="true"> · </span>
                <span className="sr-only">: </span>
                {streaming ? (
                  d.honestyPending
                ) : toCheck > 0 ? (
                  <span className={TONE_CLASSES.warn.text}>{d.honestyToCheck(toCheck)}</span>
                ) : (
                  <span className={TONE_CLASSES.good.text}>{d.honestyClean}</span>
                )}
              </>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {!streaming && copyText ? (
              <CopyButton
                // Re-mount per tab so a "Copied ✓" from one tab doesn't linger on the next.
                key={tab}
                text={copyText}
                label={tab === 'cvBullets' ? d.copyAll : d.copy}
                variant="default"
                className="min-w-24"
              />
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={onRedo}
              disabled={streaming}
              aria-describedby="draft-redo-hint"
            >
              <RotateCw aria-hidden="true" />
              {d.redo}
            </Button>
            <span id="draft-redo-hint" className="sr-only">
              {d.redoHint}
            </span>
          </div>
        </div>

        <p className="flex gap-2 text-xs text-muted-foreground">
          <Info aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          <span>
            {d.disclaimer} {d.factsNote}
          </span>
        </p>
      </div>
    </ResultCard>
  );
}

/** Drafts stream in order: cover letter → cold DM → bullets. The live one is the last started. */
function currentlyWriting(drafts: PartialDrafts): DraftKey {
  if (drafts.cvBullets.length > 0) return 'cvBullets';
  if (drafts.coldDm) return 'coldDm';
  return 'coverLetter';
}

function TextDraft({
  text,
  flagged,
  streaming,
  live,
}: {
  text: string | undefined;
  flagged: string[];
  streaming: boolean;
  live: boolean;
}) {
  if (!text) return streaming ? <WritingSkeleton /> : <p className="text-sm text-muted-foreground">{strings.drafts.empty}</p>;
  return (
    <div className="grid gap-3">
      <HonestyNote flagged={flagged} />
      <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap text-foreground/90">
        <Highlighted text={text} terms={flagged} />
        {live ? <StreamingCursor /> : null}
      </p>
    </div>
  );
}

function BulletDrafts({
  bullets,
  flagged,
  streaming,
  live,
}: {
  /** Only bullets that already have an improved version. */
  bullets: PartialDrafts['cvBullets'];
  flagged: string[];
  streaming: boolean;
  live: boolean;
}) {
  const d = strings.drafts;
  if (bullets.length === 0) return streaming ? <WritingSkeleton /> : <p className="text-sm text-muted-foreground">{d.empty}</p>;

  return (
    <div className="grid gap-3">
      <HonestyNote flagged={flagged} />
      <ol className="grid gap-3">
        {bullets.map((b, i) => (
          <li key={i} className="grid gap-2 rounded-md border border-border bg-elevated/40 p-3">
            {b.original ? (
              <p className="text-[13px] leading-relaxed break-words text-muted-foreground">
                <span className={cn('font-mono text-[11px] tracking-[0.08em] uppercase', QUIET_TEXT)}>{d.bulletBefore}</span>{' '}
                {b.original}
              </p>
            ) : null}
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 text-[15px] leading-relaxed break-words text-foreground/90">
                <span className="sr-only">{d.bulletAfter}: </span>
                <Highlighted text={b.improved ?? ''} terms={flagged} />
                {live && i === bullets.length - 1 ? <StreamingCursor /> : null}
              </p>
              {!streaming ? (
                <CopyButton text={b.improved ?? ''} iconOnly aria-label={d.bulletCopyAriaLabel(i + 1)} className="size-10" />
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function HonestyNote({ flagged }: { flagged: string[] }) {
  if (flagged.length === 0) return null;
  const d = strings.drafts;
  const items = [...new Set(flagged)].map((t) => `“${t}”`).join(', ');
  return (
    <div className={cn('flex gap-2.5 rounded-md border p-3 text-sm', TONE_CLASSES.warn.surface)}>
      <TriangleAlert aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', TONE_CLASSES.warn.icon)} />
      <p className="min-w-0 break-words">
        <span className={cn('font-medium', TONE_CLASSES.warn.text)}>{d.honestyTitle}. </span>
        {d.honestyBody(items)}
      </p>
    </div>
  );
}

/**
 * Wraps each whole-token occurrence of a flagged term in <mark> (a flagged "6" must not light up
 * the 6 in "2026"). Copying still copies the plain text.
 */
function Highlighted({ text, terms }: { text: string; terms: string[] }): ReactNode {
  const unique = [...new Set(terms.filter((t) => t.trim().length > 0))].sort((a, b) => b.length - a.length);
  if (unique.length === 0) return text;
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${unique.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
  // With one capture group, split() puts the matches at the odd indexes.
  return text.split(pattern).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded-sm bg-partial/20 px-0.5 text-inherit underline decoration-partial decoration-dotted underline-offset-2">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function StreamingCursor() {
  return (
    <span
      aria-hidden="true"
      className="motion-hide ml-0.5 inline-block h-[1.1em] w-2 translate-y-[0.2em] animate-blink bg-signal"
    />
  );
}

function WritingSkeleton() {
  return (
    <div className="grid gap-2.5">
      <p className={cn('font-mono text-xs', QUIET_TEXT)}>{strings.drafts.writing}</p>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}
