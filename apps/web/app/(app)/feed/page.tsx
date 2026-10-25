import { buttonVariants } from '@/components/ui/button';

// /feed placeholder (Day 3). The matched feed (docs/03-UI-UX.md §4.5) lands on Day 4 (W14/W15).

export const metadata = { title: 'Feed' };

export default function FeedPage() {
  return (
    <section className="max-w-2xl">
      <h1 className="text-3xl font-bold tracking-[-0.03em]">Your feed</h1>
      <p className="mt-3 text-pretty text-muted-foreground">
        Daily matched jobs are coming next. For now, paste a job you found and get a saved analysis.
      </p>
      <a href="/jobs/new" className={buttonVariants({ className: 'mt-6' })}>
        Add a job
      </a>
    </section>
  );
}
