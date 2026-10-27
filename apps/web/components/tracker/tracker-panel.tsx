'use client';

// Tracker panel on /jobs/[id] (docs/03-UI-UX.md §4.6, §4.8, W16): add the job to the tracker, then
// stage, channel, follow-up date, the follow-up message (PRD F1.8), notes and remove. The tracker
// card's "Follow up" chip links here (#tracker).
import { useState } from 'react';
import type { HonestyFlag } from '@jobpilot/core/schemas';
import { LABEL_CLASS, TONE_CLASSES } from '@/components/analyzer/tone';
import { CopyButton } from '@/components/copy-button';
import { Button, buttonVariants } from '@/components/ui/button';
import { createApplication, deleteApplication, TrackerApiError, updateApplication, writeFollowUp, type ApplicationPatch } from '@/lib/client/tracker-api';
import { strings } from '@/lib/strings';
import { CHANNELS, isFollowUpDue, NOTES_MAX, STAGES, type ApplicationFields, type Channel, type Stage } from '@/lib/tracker';
import { cn } from '@/lib/utils';
import { STAGE_SELECT_CLASS } from './application-card';
import { useStageDialogs } from './use-stage-dialogs';

export interface PanelFollowUp {
  message: string;
  honestyFlags: HonestyFlag[];
  createdAt: string;
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmt = (iso: string) => dateFmt.format(new Date(iso));

export function TrackerPanel({
  jobId,
  application: initial,
  followUp: initialFollowUp,
  today,
}: {
  jobId: string;
  application: ApplicationFields | null;
  followUp: PanelFollowUp | null;
  today: string;
}) {
  const s = strings.tracker;
  const p = s.panel;
  const [app, setApp] = useState(initial);
  const [followUp, setFollowUp] = useState(initialFollowUp);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [busy, setBusy] = useState<null | 'track' | 'save' | 'followup' | 'notes' | 'remove'>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const { askChannel, dialogs } = useStageDialogs();

  const fail = (err: unknown) => setError(err instanceof TrackerApiError ? err.message : s.moveFailed);

  async function run(kind: NonNullable<typeof busy>, fn: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  const track = (stage: Stage) =>
    run('track', async () => {
      const channel = stage === 'applied' ? await askChannel() : null;
      const { application } = await createApplication(jobId, { stage, channel });
      setApp(application);
      setNotes(application.notes ?? '');
    });

  const patch = (body: ApplicationPatch, kind: 'save' | 'notes' = 'save', done?: string) =>
    run(kind, async () => {
      if (!app) return;
      const { application } = await updateApplication(app.id, body);
      setApp(application);
      if (done) setNotice(done);
    });

  async function changeStage(stage: Stage) {
    if (!app) return;
    const body: ApplicationPatch = { stage };
    if (stage === 'applied' && app.channel === null) {
      const channel = await askChannel();
      if (channel) body.channel = channel;
    }
    await patch(body);
  }

  const write = () =>
    run('followup', async () => {
      if (!app) return;
      const { followUp: f } = await writeFollowUp(app.id);
      setFollowUp(f);
    });

  const remove = () =>
    run('remove', async () => {
      if (!app) return;
      await deleteApplication(app.id);
      setApp(null);
      setFollowUp(null);
      setNotes('');
      setConfirmRemove(false);
    });

  const due = app ? isFollowUpDue(app, today) : false;

  return (
    <section id="tracker" aria-labelledby="tracker-title" className="scroll-mt-24 rounded-xl border bg-card px-4 py-4 sm:px-5">
      <div className="flex items-center justify-between gap-2">
        <h2 id="tracker-title" className={LABEL_CLASS}>
          {p.title}
        </h2>
        {app && (
          <a href="/tracker" className="font-mono text-xs text-subtle hover:text-foreground">
            {p.openTracker} →
          </a>
        )}
      </div>

      {!app ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">{p.notTracked}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={busy !== null} onClick={() => void track('saved')}>
              {p.save}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void track('applied')}>
              {p.markApplied}
            </Button>
          </div>
        </>
      ) : (
        <div className="mt-3 grid gap-4">
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs text-muted-foreground">
              {s.stageLabel}
              <select className={cn(STAGE_SELECT_CLASS, 'h-9 text-sm')} value={app.stage} disabled={busy !== null} onChange={(e) => void changeStage(e.target.value as Stage)}>
                {STAGES.map((st) => (
                  <option key={st} value={st}>
                    {s.stages[st]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              {s.channelLabel}
              <select
                className={cn(STAGE_SELECT_CLASS, 'h-9 text-sm')}
                value={app.channel ?? ''}
                disabled={busy !== null}
                onChange={(e) => void patch({ channel: (e.target.value || null) as Channel | null })}
              >
                <option value="">{s.noChannel}</option>
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {s.channels[c]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {(app.appliedAt || app.lastContactAt) && (
            <p className="font-mono text-xs text-subtle">
              {[app.appliedAt && p.appliedOn(fmt(app.appliedAt)), app.lastContactAt && p.lastContact(fmt(app.lastContactAt))].filter(Boolean).join(' · ')}
            </p>
          )}

          {app.stage === 'applied' && (
            <div className="grid gap-2">
              <label className="grid gap-1 text-xs text-muted-foreground">
                {p.followUpBy}
                <input
                  type="date"
                  className={cn(STAGE_SELECT_CLASS, 'h-9 w-fit text-sm')}
                  value={app.followUpDueAt ?? ''}
                  disabled={busy !== null}
                  onChange={(e) => void patch({ followUpDueAt: e.target.value || null })}
                />
              </label>
              {due && <p className={cn('text-sm', TONE_CLASSES.warn.text)}>⏰ {p.followUpDueNow}</p>}
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant={due ? 'default' : 'outline'} disabled={busy !== null} onClick={() => void write()}>
                  {busy === 'followup' ? p.writingFollowUp : followUp ? p.rewriteFollowUp : p.writeFollowUp}
                </Button>
              </div>
            </div>
          )}

          {followUp && (
            <div className="grid gap-2 rounded-lg border bg-background/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{p.followUpTitle}</h3>
                <CopyButton text={followUp.message} />
              </div>
              <p className="text-sm whitespace-pre-wrap">{followUp.message}</p>
              {followUp.honestyFlags.length > 0 && (
                <p className={cn('text-xs', TONE_CLASSES.warn.text)}>{p.followUpFlag(followUp.honestyFlags.map((f) => `“${f.text}”`).join(', '))}</p>
              )}
              <p className="text-xs text-subtle">{p.followUpHint}</p>
              {app.stage === 'applied' && (
                <Button type="button" size="sm" variant="outline" className="w-fit" disabled={busy !== null} onClick={() => void patch({ followedUp: true }, 'save', p.followedUp)}>
                  {p.markFollowedUp}
                </Button>
              )}
            </div>
          )}

          <form
            className="grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void patch({ notes: notes.trim() ? notes : null }, 'notes', p.saved);
            }}
          >
            <label className="grid gap-1 text-xs text-muted-foreground">
              {p.notes}
              <textarea
                value={notes}
                maxLength={NOTES_MAX}
                rows={3}
                placeholder={p.notesPlaceholder}
                onChange={(e) => setNotes(e.target.value)}
                className="rounded-md border border-border-strong bg-card px-2.5 py-2 text-sm text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </label>
            <Button type="submit" size="sm" variant="outline" className="w-fit" disabled={busy !== null || notes === (app.notes ?? '')}>
              {p.saveNotes}
            </Button>
          </form>

          <div className="border-t pt-3">
            {confirmRemove ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>{p.removeConfirm}</span>
                <Button type="button" size="sm" variant="destructive" disabled={busy !== null} onClick={() => void remove()}>
                  {p.removeYes}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
                  {p.removeNo}
                </Button>
              </div>
            ) : (
              <button type="button" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'px-0 text-subtle')} onClick={() => setConfirmRemove(true)}>
                {p.remove}
              </button>
            )}
          </div>
        </div>
      )}

      <div aria-live="polite" className="mt-2 min-h-5 text-sm">
        {error ? <p className="text-miss">{error}</p> : notice ? <p className="text-subtle">{notice}</p> : null}
      </div>
      {dialogs}
    </section>
  );
}
