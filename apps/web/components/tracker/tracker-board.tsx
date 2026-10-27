'use client';

// /tracker client (docs/03-UI-UX.md §4.8, W16). Desktop: kanban columns with native drag and drop
// (no library: cards move between columns and reorder inside one). Phones: the same columns stacked
// as a list, with the stage select on each card (touch screens don't fire HTML drag events).
// Every change is optimistic and rolled back if the PATCH fails. Moving to Applied asks for the
// channel; dropping on Closed asks Rejected or Ghosted.
import { useState, type DragEvent } from 'react';
import { LABEL_CLASS } from '@/components/analyzer/tone';
import { buttonVariants } from '@/components/ui/button';
import { updateApplication, type ApplicationPatch } from '@/lib/client/tracker-api';
import { strings } from '@/lib/strings';
import { COLUMNS, columnOf, groupByColumn, positionBetween, topPosition, type Column, type Stage, type TrackerItem } from '@/lib/tracker';
import { cn } from '@/lib/utils';
import { ApplicationCard } from './application-card';
import { useStageDialogs } from './use-stage-dialogs';

interface DropTarget {
  column: Column;
  /** Insert before this card; null = at the end of the column. */
  beforeId: string | null;
}

export function TrackerBoard({ items: initial, today }: { items: TrackerItem[]; today: string }) {
  const s = strings.tracker;
  const [items, setItems] = useState(initial);
  const [showClosed, setShowClosed] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { askChannel, askClosed, dialogs } = useStageDialogs();

  const columns = groupByColumn(items);

  /** Moves a card to `stage` at `position`, asking the channel / closing question first if needed. */
  async function move(item: TrackerItem, stage: Stage, position: number) {
    const patch: ApplicationPatch = {};
    if (stage === 'applied' && item.stage !== 'applied' && item.channel === null) {
      const channel = await askChannel();
      if (channel) patch.channel = channel;
    }
    if (stage !== item.stage) patch.stage = stage;
    if (position !== item.position) patch.position = position;
    if (Object.keys(patch).length === 0) return;

    const before = items;
    const now = new Date().toISOString();
    setError(null);
    setItems((list) =>
      list.map((it) =>
        it.id === item.id
          ? { ...it, stage, position, channel: patch.channel ?? it.channel, appliedAt: it.appliedAt ?? (stage === 'applied' ? now : null), updatedAt: now }
          : it,
      ),
    );
    try {
      const { application } = await updateApplication(item.id, patch);
      setItems((list) => list.map((it) => (it.id === item.id ? { ...it, ...application } : it)));
    } catch {
      setItems(before);
      setError(s.moveFailed);
    }
  }

  /** Stage picked in a card's select: the card goes on top of its new column. */
  async function changeStage(item: TrackerItem, stage: Stage) {
    const target = columns[columnOf(stage)].filter((it) => it.id !== item.id);
    await move(item, stage, columnOf(stage) === columnOf(item.stage) ? item.position : topPosition(target));
  }

  async function dropOn(target: DropTarget) {
    const item = items.find((it) => it.id === dragId);
    setDragId(null);
    setDrop(null);
    if (!item) return;
    const list = columns[target.column].filter((it) => it.id !== item.id);
    const at = target.beforeId ? list.findIndex((it) => it.id === target.beforeId) : list.length;
    const index = at < 0 ? list.length : at;
    const position = positionBetween(list[index - 1]?.position, list[index]?.position);

    let stage: Stage;
    if (target.column === 'closed') {
      const closed = columnOf(item.stage) === 'closed' ? item.stage : await askClosed();
      if (!closed) return;
      stage = closed;
    } else {
      stage = target.column;
    }
    await move(item, stage, position);
  }

  const onCardDragOver = (column: Column, list: TrackerItem[], index: number) => (e: DragEvent<HTMLElement>) => {
    if (!dragId) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const upper = e.clientY < rect.top + rect.height / 2;
    const beforeId = upper ? list[index]!.id : (list[index + 1]?.id ?? null);
    if (drop?.column !== column || drop.beforeId !== beforeId) setDrop({ column, beforeId });
  };

  const visibleColumns = COLUMNS.filter((c) => c !== 'closed' || showClosed);
  const indicator = <div aria-hidden className="h-0.5 rounded-full bg-signal" />;

  return (
    <section className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-[-0.03em]">{s.title}</h1>
          <p className="mt-2 max-w-xl text-sm text-pretty text-muted-foreground">{s.intro}</p>
        </div>
        {columns.closed.length > 0 && (
          <button type="button" className={buttonVariants({ variant: 'outline', size: 'sm' })} onClick={() => setShowClosed((v) => !v)}>
            {showClosed ? s.hideClosed : s.showClosed(columns.closed.length)}
          </button>
        )}
      </header>

      {error && (
        <p role="alert" className="text-sm text-miss">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <div className="rounded-xl border bg-card px-5 py-8 sm:px-8">
          <h2 className="text-xl font-semibold">{s.empty.title}</h2>
          <p className="mt-2 max-w-xl text-pretty text-muted-foreground">{s.empty.body}</p>
          <a href="/feed" className={cn(buttonVariants(), 'mt-6')}>
            {s.empty.action} →
          </a>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-flow-col md:auto-cols-[minmax(13.5rem,1fr)] md:gap-3 md:overflow-x-auto md:pb-2">
          {visibleColumns.map((column) => {
            const list = columns[column];
            const isTarget = drop?.column === column;
            return (
              <div
                key={column}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  if (!isTarget || drop?.beforeId !== null) setDrop({ column, beforeId: null });
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (drop) void dropOn(drop);
                }}
                className={cn('flex min-w-0 flex-col gap-2 rounded-xl md:min-h-48 md:border md:bg-elevated/30 md:p-2', isTarget && 'md:border-signal-text/50')}
              >
                <h2 className={cn(LABEL_CLASS, 'flex items-center justify-between px-1 pt-1')}>
                  <span>{s.columns[column]}</span>
                  <span>{list.length}</span>
                </h2>
                {list.map((it, i) => (
                  <div key={it.id} className="grid gap-2">
                    {isTarget && drop?.beforeId === it.id && indicator}
                    <ApplicationCard
                      item={it}
                      today={today}
                      dragging={dragId === it.id}
                      onStage={(stage) => void changeStage(it, stage)}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', it.id);
                        setDragId(it.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setDrop(null);
                      }}
                      onDragOver={onCardDragOver(column, list, i)}
                    />
                  </div>
                ))}
                {isTarget && drop?.beforeId === null && indicator}
                {list.length === 0 && <p className="px-1 pb-2 text-xs text-subtle">{dragId ? s.dropHere : s.emptyColumn}</p>}
              </div>
            );
          })}
        </div>
      )}
      {dialogs}
    </section>
  );
}
