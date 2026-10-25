'use client';

// Login card body (docs/03-UI-UX.md §4.3): "Continue with Google" + magic-link email form, then
// "Check your inbox" with a 60-second resend cooldown. Google is a plain link to /auth/google, so it
// works before hydration; the email form posts JSON to /api/auth/magic-link.
import { useEffect, useState, type FormEvent } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { strings } from '@/lib/strings';
import { cn } from '@/lib/utils';

const RESEND_COOLDOWN_S = 60;

type Phase = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' };

export function LoginForm({ next, initialError }: { next: string; initialError: string | null }) {
  const s = strings.auth.login;
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(initialError);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (phase.kind === 'sending') return;
    setError(null);
    setPhase({ kind: 'sending' });
    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(body?.error?.message ?? s.errors.generic!);
        setPhase({ kind: 'idle' });
        return;
      }
      setPhase({ kind: 'sent' });
      setCooldown(RESEND_COOLDOWN_S);
    } catch {
      setError(s.errors.generic!);
      setPhase({ kind: 'idle' });
    }
  }

  const googleHref = `/auth/google?next=${encodeURIComponent(next)}`;

  if (phase.kind === 'sent') {
    return (
      <div className="grid gap-4" aria-live="polite">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.02em]">{s.sentTitle}</h2>
          <p className="mt-1.5 text-sm text-pretty text-muted-foreground">{s.sentBody}</p>
          <p className="mt-2 font-mono text-xs break-all text-subtle">{email}</p>
        </div>
        {error && <p className="text-sm text-miss">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={cooldown > 0} onClick={() => void send()}>
            {cooldown > 0 ? s.resendIn(cooldown) : s.resend}
          </Button>
          <Button variant="ghost" onClick={() => setPhase({ kind: 'idle' })}>
            {s.useOtherEmail}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <a href={googleHref} className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'w-full')}>
        <GoogleMark />
        {s.google}
      </a>

      <div className="flex items-center gap-3 font-mono text-xs text-subtle">
        <span className="h-px flex-1 bg-border" />
        {s.or}
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={(e) => void send(e)} className="grid gap-3" noValidate={false}>
        <label htmlFor="login-email" className="text-sm font-medium">
          {s.emailLabel}
        </label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={254}
          placeholder={s.emailPlaceholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'login-error' : undefined}
        />
        {error && (
          <p id="login-error" role="alert" className="text-sm text-miss">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={phase.kind === 'sending' || !email.trim()}>
          {phase.kind === 'sending' ? s.sending : s.sendLink}
        </Button>
      </form>
    </div>
  );
}

/** Google "G" mark, as required next to "Continue with Google". */
function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="size-4">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
