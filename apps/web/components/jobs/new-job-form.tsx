'use client';

// /jobs/new (docs/03-UI-UX.md §4.7): paste a job post → POST /api/jobs → /jobs/[id], where the
// analysis starts. URL import (F1.6 P1) comes later.
import { useState, type FormEvent } from 'react';
import { JOB_TEXT_MAX, JOB_TEXT_MIN } from '@jobpilot/core/schemas';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { strings } from '@/lib/strings';

export function NewJobForm() {
  const s = strings.jobs.new;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const length = text.trim().length;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jobText: text }),
      });
      const body = (await res.json().catch(() => null)) as { jobId?: string; error?: { message?: string } } | null;
      if (!res.ok || !body?.jobId) {
        setError(body?.error?.message ?? strings.onboarding.errors.generic);
        setBusy(false);
        return;
      }
      window.location.assign(`/jobs/${body.jobId}`);
    } catch {
      setError(strings.onboarding.errors.generic);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="grid max-w-3xl gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-[-0.03em]">{s.title}</h1>
        <p className="mt-2 text-pretty text-muted-foreground">{s.body}</p>
      </div>
      <label htmlFor="job-text" className="sr-only">
        {s.label}
      </label>
      <Textarea
        id="job-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={s.placeholder}
        maxLength={JOB_TEXT_MAX}
        className="min-h-80 font-mono text-[13px] sm:text-[13px]"
        disabled={busy}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-xs text-subtle">{s.count(length, JOB_TEXT_MIN)}</span>
        <Button type="submit" size="lg" disabled={busy || length < JOB_TEXT_MIN}>
          {busy ? s.saving : s.submit}
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
