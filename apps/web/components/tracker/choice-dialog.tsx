'use client';

// A small modal with one button per choice (docs/03-UI-UX.md §4.8: the channel question when a card
// moves to Applied, and Rejected/Ghosted for the Closed column). Native <dialog>: focus is trapped,
// Escape and the dismiss button both resolve with null.
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

export interface Choice<T extends string> {
  value: T;
  label: string;
}

export function ChoiceDialog<T extends string>({
  open,
  title,
  body,
  choices,
  dismissLabel,
  onChoose,
}: {
  open: boolean;
  title: string;
  body: string;
  choices: ReadonlyArray<Choice<T>>;
  dismissLabel: string;
  onChoose: (value: T | null) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="choice-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onChoose(null);
      }}
      className="m-auto w-[min(92vw,26rem)] rounded-xl border bg-card p-5 text-foreground backdrop:bg-black/50"
    >
      <h2 id="choice-dialog-title" className="text-lg font-semibold">
        {title}
      </h2>
      <p className="mt-1 text-sm text-pretty text-muted-foreground">{body}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {choices.map((c) => (
          <Button key={c.value} type="button" variant="outline" onClick={() => onChoose(c.value)}>
            {c.label}
          </Button>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={() => onChoose(null)}>
          {dismissLabel}
        </Button>
      </div>
    </dialog>
  );
}
