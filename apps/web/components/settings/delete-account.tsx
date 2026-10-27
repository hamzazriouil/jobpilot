'use client';

// Delete account (docs/03-UI-UX.md §4.12, PRD F1.10): the user types DELETE, then
// DELETE /api/account removes everything and signs them out; we land on the home page.
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { strings } from '@/lib/strings';

export function DeleteAccount() {
  const s = strings.settings.account;
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <>
        <Button type="button" variant="destructive" size="sm" onClick={() => setOpen(true)}>
          {s.delete}
        </Button>
        <p className="mt-2 text-xs text-subtle">{s.deleteHint}</p>
      </>
    );
  }

  return (
    <form
      className="grid gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (typed !== 'DELETE') return;
        setBusy(true);
        setError(null);
        const ok = await fetch('/api/account', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ confirm: 'DELETE' }),
        })
          .then((r) => r.ok)
          .catch(() => false);
        if (ok) {
          window.location.assign('/');
          return;
        }
        setBusy(false);
        setError(s.deleteFailed);
      }}
    >
      <p className="text-sm text-pretty">{s.deleteHint}</p>
      <label className="grid gap-1 text-xs text-muted-foreground">
        {s.deleteConfirmLabel}
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="h-9 w-48 rounded-md border border-border-strong bg-card px-2.5 font-mono text-sm text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="destructive" size="sm" disabled={typed !== 'DELETE' || busy}>
          {busy ? s.deleting : s.deleteConfirm}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setTyped('');
          }}
        >
          {s.cancel}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-miss">
          {error}
        </p>
      )}
    </form>
  );
}
