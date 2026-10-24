'use client';

// Requirements with met / partly met / missing, the CV quote that proves it, and a type tag.
// Rows render as they stream in; once the result is final the list collapses after 6.
import { useId, useState } from 'react';
import { CircleAlert, CircleCheck, CircleX, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { strings } from '@/lib/strings';
import type { PartialRequirement } from '@/lib/client/partial';
import { EvidenceQuote } from './evidence-quote';
import { ResultCard } from './result-card';
import { STATUS_TONE, TONE_CLASSES } from './tone';

const COLLAPSED_COUNT = 6;
const STATUS_ICON = { met: CircleCheck, partial: CircleAlert, missing: CircleX } as const;

export function RequirementList({
  requirements,
  streaming,
}: {
  requirements: PartialRequirement[];
  streaming: boolean;
}) {
  const r = strings.results.requirements;
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const canCollapse = !streaming && requirements.length > COLLAPSED_COUNT;
  const visible = canCollapse && !expanded ? requirements.slice(0, COLLAPSED_COUNT) : requirements;

  return (
    <ResultCard title={r.title}>
      {requirements.length === 0 && streaming ? (
        <RequirementSkeletonRows />
      ) : (
        <ul id={listId} className="grid gap-4">
          {visible.map((req, i) => (
            <RequirementRow
              key={i}
              requirement={req}
              // The last row of a live stream may still be arriving.
              pending={streaming && !req.status}
            />
          ))}
        </ul>
      )}
      {canCollapse ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-3 -ml-3"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? r.showFewer : r.showAll(requirements.length)}
        </Button>
      ) : null}
    </ResultCard>
  );
}

function RequirementRow({ requirement, pending }: { requirement: PartialRequirement; pending: boolean }) {
  const r = strings.results.requirements;
  const { text, type, status, evidenceQuote, evidenceSource, note } = requirement;
  const tone = status ? STATUS_TONE[status] : 'neutral';
  const Icon = status ? STATUS_ICON[status] : LoaderCircle;
  const statusLabel = status ? r.status[status] : r.pending;

  return (
    <li className="flex gap-3">
      <Icon
        aria-hidden="true"
        className={cn(
          'mt-0.5 size-4 shrink-0',
          TONE_CLASSES[tone].icon,
          pending && 'animate-spin motion-reduce:animate-none',
        )}
      />
      <div className="grid min-w-0 flex-1 gap-1.5">
        <p className="text-sm leading-snug">
          <span className="sr-only">{statusLabel}: </span>
          <span className="font-medium break-words">{text}</span>
          {type ? (
            <span className="ml-2 inline-block rounded border px-1.5 py-px align-middle font-mono text-[11px] text-muted-foreground">
              {r.type[type]}
            </span>
          ) : null}
        </p>
        {status ? (
          <p aria-hidden="true" className={cn('font-mono text-[11px] uppercase', TONE_CLASSES[tone].text)}>
            {statusLabel}
          </p>
        ) : null}
        {evidenceQuote ? (
          <EvidenceQuote
            quote={evidenceQuote}
            tone={tone}
            source={evidenceSource && evidenceSource !== 'none' ? strings.results.sources[evidenceSource] : undefined}
          />
        ) : null}
        {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
      </div>
    </li>
  );
}

function RequirementSkeletonRows() {
  return (
    <div className="grid gap-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="size-4 shrink-0 rounded-full" />
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
