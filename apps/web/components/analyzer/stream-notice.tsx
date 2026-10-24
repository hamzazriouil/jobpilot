// Error / quota / busy / stopped messages for a stream (docs/03-UI-UX.md §6), in tone surfaces
// with a mono title (docs/08-BRAND-UI.md). Inputs are never cleared by any of these; every
// recoverable case offers a retry.
import { CircleAlert, CircleX, Info, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { strings } from '@/lib/strings';
import type { StreamError } from '@/lib/client/stream';
import { TONE_CLASSES, type Tone } from './tone';

interface NoticeCopy {
  tone: Tone;
  title: string;
  body: string;
  /** Label of the action button, or null when retrying now can't help. */
  action: string | null;
}

function noticeCopy(error: StreamError, context: 'analyze' | 'draft'): NoticeCopy {
  const s = strings.states;
  switch (error.code) {
    case 'quota_exceeded':
      return { tone: 'warn', ...(context === 'draft' ? s.draftQuota : s.quota), action: null };
    case 'busy':
      return { tone: 'warn', ...s.busy, action: s.retry };
    case 'bad_input':
      return { tone: 'warn', title: s.badInput.title, body: error.message || s.badInput.fallback, action: null };
    case 'aborted':
      return { tone: 'neutral', ...s.aborted, action: s.restart };
    case 'incomplete':
      return { tone: 'warn', ...s.incomplete, action: s.retry };
    case 'network':
      return { tone: 'bad', ...s.network, action: s.retry };
    default:
      return { tone: 'bad', ...s.internal, action: s.retry };
  }
}

const TONE_ICON = { good: Info, warn: TriangleAlert, bad: CircleX, neutral: CircleAlert } as const;

export function StreamNotice({
  error,
  context,
  onRetry,
  className,
}: {
  error: StreamError;
  context: 'analyze' | 'draft';
  onRetry?: () => void;
  className?: string;
}) {
  const copy = noticeCopy(error, context);
  const Icon = TONE_ICON[copy.tone];
  const tone = TONE_CLASSES[copy.tone];
  const userStopped = error.code === 'aborted';

  return (
    <div
      // A stop the user asked for is a status, not an alert.
      role={userStopped ? 'status' : 'alert'}
      className={cn('flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start', tone.surface, className)}
    >
      <Icon aria-hidden="true" className={cn('size-5 shrink-0', tone.icon)} />
      <div className="grid min-w-0 flex-1 gap-1">
        <p className={cn('font-mono text-[13px] font-medium break-words', copy.tone === 'neutral' ? 'text-foreground' : tone.text)}>
          {copy.title}
        </p>
        <p className="text-sm break-words text-muted-foreground">{copy.body}</p>
      </div>
      {copy.action && onRetry ? (
        <Button
          type="button"
          variant="outline"
          onClick={onRetry}
          // After the user presses Stop, the Stop button disappears: move focus to the way back.
          autoFocus={userStopped}
          className="self-start bg-card/60"
        >
          {copy.action}
        </Button>
      ) : null}
    </div>
  );
}
