import { notFound } from 'next/navigation';
import { FeedView } from '@/components/feed/feed-view';
import type { FeedItem } from '@/lib/feed';
import { utcDay } from '@/lib/server/matching';

// DEV ONLY: /dev/feed-preview renders the feed UI with fixture cards (no sign-in, no network), for
// checking layouts on desktop and mobile. Production answers 404.

export const dynamic = 'force-dynamic';

export default function FeedPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  const today = utcDay();
  const yesterday = utcDay(new Date(Date.now() - 86_400_000));
  const posted = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
  const job = (id: string, over: Partial<FeedItem>): FeedItem => ({
    jobId: `00000000-0000-4000-8000-00000000000${id}`,
    matchDate: today,
    dismissed: false,
    title: 'AI Engineer',
    company: 'Acme',
    locationRaw: null,
    eligibilityType: 'worldwide',
    allowedRegions: [],
    tags: ['typescript', 'llm', 'rag'],
    postedAt: posted(2),
    url: 'https://remoteok.com/remote-jobs/example',
    attribution: { label: 'Via Remote OK', href: 'https://remoteok.com' },
    analysis: null,
    ...over,
  });
  const items: FeedItem[] = [
    job('1', { analysis: { score: 84, band: 'strong', verdict: 'eligible', mustMet: 5, mustTotal: 6, topGap: 'evals experience', current: true } }),
    job('2', {
      title: 'Full-stack Engineer (Next.js, Python) with a very long title that wraps on phones',
      company: 'Northwind Labs',
      eligibilityType: 'regions',
      allowedRegions: ['US', 'CA', 'EU', 'UK', 'EMEA'],
      attribution: { label: 'Via Himalayas', href: 'https://himalayas.app' },
      analysis: { score: 41, band: 'stretch', verdict: 'not_eligible', mustMet: 2, mustTotal: 5, topGap: 'Kubernetes', current: false },
    }),
    job('3', { title: 'Agent Engineer', company: 'Globex', eligibilityType: 'unclear', postedAt: posted(0) }),
    job('4', { title: 'LLM Platform Engineer', company: 'Initech', matchDate: yesterday, analysis: { score: 67, band: 'good', verdict: 'unclear', mustMet: 3, mustTotal: 4, topGap: null, current: true } }),
    job('5', { title: 'Prompt Engineer', company: 'Umbrella', dismissed: true }),
  ];
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <FeedView items={items} today={today} autoAnalyze={0} loadFailed={false} />
    </main>
  );
}
