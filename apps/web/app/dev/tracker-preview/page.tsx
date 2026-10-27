import { notFound } from 'next/navigation';
import { StatsView } from '@/components/stats/stats-view';
import { TrackerBoard } from '@/components/tracker/tracker-board';
import { TrackerPanel } from '@/components/tracker/tracker-panel';
import { utcDay } from '@/lib/server/matching';
import { computeStats, type StatsApplication, type StatsEvent } from '@/lib/stats';
import { addDays, type TrackerItem } from '@/lib/tracker';

// DEV ONLY: /dev/tracker-preview renders the tracker board, the job page tracker panel (tracked and
// not tracked) and the stats view with fixtures (no sign-in, no network), for checking layouts on
// desktop and mobile. Saving from here fails (no session). Production answers 404.

export const dynamic = 'force-dynamic';

export default function TrackerPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  const now = new Date();
  const today = utcDay(now);
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
  let n = 0;
  const item = (over: Partial<TrackerItem>): TrackerItem => {
    n++;
    return {
      id: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`,
      jobId: `00000000-0000-4000-8000-0000000002${String(n).padStart(2, '0')}`,
      title: 'AI Engineer',
      company: 'Acme',
      url: null,
      stage: 'saved',
      position: n,
      channel: null,
      appliedAt: null,
      lastContactAt: null,
      followUpDueAt: null,
      notes: null,
      createdAt: ago(8),
      updatedAt: ago(1),
      analysis: null,
      ...over,
    };
  };
  const items: TrackerItem[] = [
    item({ analysis: { score: 84, band: 'strong' } }),
    item({ title: 'Full-stack Engineer (Next.js, Python) with a very long title that wraps', company: 'Northwind Labs', analysis: { score: 41, band: 'stretch' } }),
    item({ stage: 'applied', title: 'Frontend Developer', company: 'Globex', channel: 'email', appliedAt: ago(6), followUpDueAt: addDays(new Date(ago(6)), 5), analysis: { score: 72, band: 'good' } }),
    item({ stage: 'applied', title: 'LLM Engineer', company: 'Initech', channel: 'linkedin', appliedAt: ago(2), followUpDueAt: addDays(new Date(ago(2)), 5) }),
    item({ stage: 'replied', title: 'Agentic Engineer', company: 'Hooli', channel: 'referral', appliedAt: ago(9), lastContactAt: ago(3), analysis: { score: 88, band: 'strong' } }),
    item({ stage: 'interviewing', title: 'AI Product Engineer', company: 'Umbrella', channel: 'form', appliedAt: ago(14), lastContactAt: ago(1) }),
    item({ stage: 'rejected', title: 'Senior ML Engineer', company: 'Stark', channel: 'email', appliedAt: ago(20), analysis: { score: 30, band: 'long_shot' } }),
    item({ stage: 'ghosted', title: 'Backend Engineer', company: 'Wayne', channel: 'form', appliedAt: ago(30) }),
  ];
  const tracked = items[2]!;

  // Stats fixture: 14 sent applications with a mix of outcomes, bands and channels.
  const apps: StatsApplication[] = [];
  const events: StatsEvent[] = [];
  const outcomes = ['replied', 'applied', 'applied', 'interviewing', 'rejected', 'applied', 'ghosted', 'applied', 'offer', 'applied', 'replied', 'applied', 'applied', 'applied'] as const;
  const bands = ['strong', 'stretch', 'stretch', 'strong', 'good', 'long_shot', 'stretch', 'good', 'strong', 'stretch', 'good', 'stretch', null, 'long_shot'] as const;
  const channels = ['email', 'form', 'form', 'referral', 'email', 'form', 'form', 'linkedin', 'email', 'form', 'linkedin', 'form', null, 'form'] as const;
  outcomes.forEach((stage, i) => {
    const id = `s${i}`;
    apps.push({ id, stage, channel: channels[i] ?? null, appliedAt: ago(20 - i), band: bands[i] ?? null });
    events.push({ applicationId: id, toStage: 'applied', at: ago(20 - i) });
    if (stage === 'offer') events.push({ applicationId: id, toStage: 'interviewing', at: ago(16 - i) });
    if (stage !== 'applied') events.push({ applicationId: id, toStage: stage, at: ago(17 - i) });
  });

  return (
    <div className="grid gap-16">
      <TrackerBoard items={items} today={today} />
      <div className="grid gap-6 md:grid-cols-2">
        <TrackerPanel
          jobId={tracked.jobId}
          application={tracked}
          today={today}
          followUp={{
            message:
              'Hello,\n\nI applied for the Frontend Developer role at Globex last week and wanted to check in. I recently shipped ApplyVerdict, a Next.js app with streamed AI analyses and 400+ tests, which maps closely to your dashboard work.\n\nIs the role still open? Happy to share more if useful.\n\nHamza',
            honestyFlags: [{ draft: 'followUp', text: 'last week' }],
            createdAt: ago(0),
          }}
        />
        <TrackerPanel jobId={items[0]!.jobId} application={null} followUp={null} today={today} />
      </div>
      <StatsView stats={computeStats(apps, events)} />
      <StatsView stats={computeStats(apps.slice(0, 4), events)} />
    </div>
  );
}
