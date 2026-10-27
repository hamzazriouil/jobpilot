'use client';

// The two questions a stage change can ask (docs/03-UI-UX.md §4.8), as promises:
//   askChannel() → the channel, or null when skipped (the move still happens, without a channel)
//   askClosed()  → 'rejected' | 'ghosted', or null when cancelled (the move is cancelled)
// Used by the board and the job page panel; render `dialogs` once.
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { strings } from '@/lib/strings';
import { CHANNELS, type Channel } from '@/lib/tracker';
import { ChoiceDialog } from './choice-dialog';

type Closed = 'rejected' | 'ghosted';
type Open = { kind: 'channel' } | { kind: 'closed' } | null;

export function useStageDialogs(): { askChannel(): Promise<Channel | null>; askClosed(): Promise<Closed | null>; dialogs: ReactNode } {
  const s = strings.tracker;
  const [open, setOpen] = useState<Open>(null);
  const resolver = useRef<((v: string | null) => void) | null>(null);

  const ask = useCallback(<T extends string>(kind: 'channel' | 'closed') => {
    resolver.current?.(null); // a newer question replaces an unanswered one
    setOpen({ kind });
    return new Promise<T | null>((resolve) => {
      resolver.current = resolve as (v: string | null) => void;
    });
  }, []);

  const answer = (v: string | null) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpen(null);
  };

  const dialogs = (
    <>
      <ChoiceDialog
        open={open?.kind === 'channel'}
        title={s.channelDialog.title}
        body={s.channelDialog.body}
        choices={CHANNELS.map((c) => ({ value: c, label: s.channels[c] }))}
        dismissLabel={s.channelDialog.skip}
        onChoose={answer}
      />
      <ChoiceDialog
        open={open?.kind === 'closed'}
        title={s.closedDialog.title}
        body={s.closedDialog.body}
        choices={(['rejected', 'ghosted'] as const).map((c) => ({ value: c, label: s.stages[c] }))}
        dismissLabel={s.closedDialog.cancel}
        onChoose={answer}
      />
    </>
  );

  return {
    askChannel: useCallback(() => ask<Channel>('channel'), [ask]),
    askClosed: useCallback(() => ask<Closed>('closed'), [ask]),
    dialogs,
  };
}
