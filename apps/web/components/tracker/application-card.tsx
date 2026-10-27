'use client';

// One tracker card (docs/03-UI-UX.md §4.8): title, company, fit, applied date and channel, the amber
// follow-up chip, and a stage select (the keyboard and phone alternative to dragging).
import type { DragEvent } from 'react';
import { BAND_TONE, TONE_CLASSES } from '@/components/analyzer/tone';
import { strings } from '@/lib/strings';
import { daysSince, isFollowUpDue, STAGES, type Stage, type TrackerItem } from '@/lib/tracker';
import { cn } from '@/lib/utils';

export const STAGE_SELECT_CLASS =
  'h-8 rounded-md border border-border-strong bg-card px-1.5 text-xs text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

export function ApplicationCard({
  item,
  today,
  dragging,
  onStage,
  onDragStart,
  onDragEnd,
  onDragOver,
}: {
  item: TrackerItem;
  today: string;
  dragging: boolean;
  onStage: (stage: Stage) => void;
  onDragStart: (e: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent<HTMLElement>) => void;
}) {
  const s = strings.tracker;
  const due = isFollowUpDue(item, today);
  const meta = [
    item.appliedAt ? s.applied(daysSince(item.appliedAt)) : null,
    item.channel ? s.channels[item.channel] : null,
    item.stage === 'rejected' || item.stage === 'ghosted' ? s.stages[item.stage] : null,
  ].filter(Boolean);

  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      className={cn('rounded-lg border bg-card px-3 py-3 md:cursor-grab', dragging && 'opacity-40')}
    >
      <h3 className="text-sm leading-snug font-semibold">
        <a href={`/jobs/${item.jobId}`} className="hover:underline hover:underline-offset-4">
          {item.title}
        </a>
      </h3>
      {item.company && <p className="mt-0.5 text-xs text-muted-foreground">{item.company}</p>}
      {item.analysis && (
        <p className={cn('mt-2 font-mono text-xs font-medium uppercase', TONE_CLASSES[BAND_TONE[item.analysis.band]].text)}>
          {strings.feed.card.bandScore(strings.feed.card.bands[item.analysis.band], item.analysis.score)}
        </p>
      )}
      {meta.length > 0 && <p className="mt-1 font-mono text-xs text-subtle">{meta.join(' · ')}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {due ? (
          <a
            href={`/jobs/${item.jobId}#tracker`}
            className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', TONE_CLASSES.warn.surface, TONE_CLASSES.warn.text)}
          >
            <span aria-hidden>⏰</span>
            {s.followUpDue}
          </a>
        ) : (
          <span />
        )}
        <label className="sr-only" htmlFor={`stage-${item.id}`}>
          {s.stageLabel}
        </label>
        <select id={`stage-${item.id}`} className={STAGE_SELECT_CLASS} value={item.stage} onChange={(e) => onStage(e.target.value as Stage)}>
          {STAGES.map((st) => (
            <option key={st} value={st}>
              {s.stages[st]}
            </option>
          ))}
        </select>
      </div>
    </article>
  );
}
