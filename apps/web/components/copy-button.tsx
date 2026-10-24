'use client';

// One-click copy (docs/03-UI-UX.md §1.5). Confirms visually and through a polite live region.
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { strings } from '@/lib/strings';

type CopyState = 'idle' | 'copied' | 'failed';

export function CopyButton({
  text,
  label = strings.drafts.copy,
  iconOnly = false,
  ...props
}: {
  text: string;
  label?: string;
  /** Icon-only buttons must pass an `aria-label`. */
  iconOnly?: boolean;
} & Omit<ComponentProps<typeof Button>, 'onClick' | 'children'>) {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => clearTimer(timer), []);

  async function onClick() {
    const ok = await copyText(text);
    setState(ok ? 'copied' : 'failed');
    clearTimer(timer);
    timer.current = setTimeout(() => setState('idle'), ok ? 2000 : 6000);
  }

  const d = strings.drafts;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size={iconOnly ? 'icon' : 'sm'}
        disabled={text.length === 0}
        onClick={onClick}
        {...props}
      >
        {state === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {iconOnly ? null : state === 'copied' ? d.copied : label}
      </Button>
      {state === 'failed' ? <span className="text-xs text-muted-foreground">{d.copyFailed}</span> : null}
      <span role="status" className="sr-only">
        {state === 'copied' ? d.copiedAnnouncement : ''}
      </span>
    </span>
  );
}

function clearTimer(timer: { current: ReturnType<typeof setTimeout> | null }) {
  if (timer.current !== null) clearTimeout(timer.current);
  timer.current = null;
}

/** Clipboard API first; falls back to a hidden textarea for older or non-secure contexts. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}
