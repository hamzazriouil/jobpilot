'use client';

// "+ Track" on a feed card (docs/03-UI-UX.md §4.5): saves the job to the tracker as Saved. Once
// tracked it becomes a link to /tracker.
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { createApplication } from '@/lib/client/tracker-api';
import { strings } from '@/lib/strings';

export function TrackButton({ jobId, tracked: initial }: { jobId: string; tracked: boolean }) {
  const t = strings.tracker.track;
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'failed'>(initial ? 'done' : 'idle');

  if (state === 'done') {
    return (
      <a href="/tracker" className="inline-flex h-8 items-center px-2 font-mono text-xs text-signal-text hover:underline hover:underline-offset-4">
        ✓ {t.tracked}
      </a>
    );
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={state === 'busy'}
      title={state === 'failed' ? t.failed : undefined}
      onClick={async () => {
        setState('busy');
        try {
          await createApplication(jobId);
          setState('done');
        } catch {
          setState('failed');
        }
      }}
    >
      {state === 'busy' ? t.adding : state === 'failed' ? `${t.add} ↻` : t.add}
    </Button>
  );
}
