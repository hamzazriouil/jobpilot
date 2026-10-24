import { Check } from 'lucide-react';
import { PageShell, RichText } from '@/components/legal/legal-page';
import { Button, buttonVariants } from '@/components/ui/button';
import { pageMetadata } from '@/lib/site';
import { legalChrome, pricing } from '@/lib/strings-legal';
import { cn } from '@/lib/utils';

// Plans per docs/01-PRD.md §9.2. Paid plans show "Coming soon" until Dodo checkout is live (Phase 2).
// Styling per docs/08-BRAND-UI.md §8: 14px cards, the main (available) plan gets a signal border,
// badge and the signal button.

export const metadata = pageMetadata({
  title: legalChrome.pageTitle(pricing.title),
  description: pricing.description,
  path: '/pricing',
});

function FeatureList({ items }: { items: ReadonlyArray<string> }) {
  return (
    <ul className="grid gap-2.5 text-sm">
      {items.map((f) => (
        <li key={f} className="flex gap-2.5">
          <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-signal-text" />
          <span className="text-pretty">{f}</span>
        </li>
      ))}
    </ul>
  );
}

export default function PricingPage() {
  const p = pricing;
  return (
    <PageShell>
      <section className="max-w-2xl">
        <h1 className="text-4xl leading-[1.05] font-bold tracking-[-0.035em] text-balance sm:text-5xl">{p.heading}</h1>
        <p className="mt-5 text-[17px] leading-relaxed text-pretty text-muted-foreground">{p.intro}</p>
      </section>

      <div className="mt-12 grid gap-4 md:grid-cols-3 md:gap-5">
        {p.plans.map((plan) => (
          <div
            key={plan.id}
            className={cn(
              'flex flex-col gap-6 rounded-xl border bg-card p-6',
              plan.available && 'border-signal ring-1 ring-signal/40',
            )}
          >
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold tracking-[-0.02em]">{plan.name}</h2>
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-xs whitespace-nowrap',
                    plan.available
                      ? 'bg-signal font-medium text-signal-foreground'
                      : 'border border-border-strong text-muted-foreground',
                  )}
                >
                  {plan.available ? p.availableNow : p.comingSoon}
                </span>
              </div>
              <p>
                <span className="font-mono text-4xl font-semibold tracking-tight tabular-nums">{plan.price}</span>{' '}
                <span className="text-sm text-muted-foreground">{plan.cadence}</span>
              </p>
              <p className="text-sm text-pretty text-muted-foreground">{plan.blurb}</p>
            </div>
            <div className="grid flex-1 content-start gap-5 border-t pt-5">
              <FeatureList items={plan.features} />
              {plan.laterFeatures ? (
                <div className="grid gap-2.5">
                  <p className="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">{p.laterLabel}</p>
                  <FeatureList items={plan.laterFeatures} />
                </div>
              ) : null}
            </div>
            <div>
              {plan.available ? (
                <a href={p.freeCtaHref} className={cn(buttonVariants({ variant: 'default', size: 'lg' }), 'w-full')}>
                  {plan.cta}
                </a>
              ) : (
                <Button variant="outline" size="lg" className="w-full" disabled>
                  {plan.cta}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <section aria-labelledby="pricing-notes" className="mt-16 max-w-3xl border-t pt-12">
        <h2 id="pricing-notes" className="text-[28px] leading-tight font-semibold tracking-[-0.03em]">
          {p.notesTitle}
        </h2>
        <ul className="mt-6 grid list-disc gap-2.5 pl-5 text-[15px] leading-relaxed text-pretty text-muted-foreground marker:text-signal-text">
          {p.notes.map((note, i) => (
            <li key={i}>
              <RichText value={note} />
            </li>
          ))}
        </ul>
      </section>
    </PageShell>
  );
}
