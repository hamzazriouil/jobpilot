import { Check } from 'lucide-react';
import { PageShell, RichText } from '@/components/legal/legal-page';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { pageMetadata } from '@/lib/site';
import { legalChrome, pricing } from '@/lib/strings-legal';
import { cn } from '@/lib/utils';

// Plans per docs/01-PRD.md §9.2. Paid plans show "Coming soon" until Dodo checkout is live (Phase 2).

export const metadata = pageMetadata({
  title: legalChrome.pageTitle(pricing.title),
  description: pricing.description,
  path: '/pricing',
});

function FeatureList({ items }: { items: ReadonlyArray<string> }) {
  return (
    <ul className="grid gap-2 text-sm">
      {items.map((f) => (
        <li key={f} className="flex gap-2">
          <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
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
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{p.heading}</h1>
        <p className="mt-4 text-pretty text-muted-foreground">{p.intro}</p>
      </section>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {p.plans.map((plan) => (
          <Card key={plan.id} className={cn('gap-5', plan.available && 'border-primary')}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-lg">{plan.name}</CardTitle>
                <Badge variant={plan.available ? 'default' : 'secondary'}>
                  {plan.available ? p.availableNow : p.comingSoon}
                </Badge>
              </div>
              <p className="mt-2">
                <span className="text-3xl font-semibold tracking-tight">{plan.price}</span>{' '}
                <span className="text-sm text-muted-foreground">{plan.cadence}</span>
              </p>
              <CardDescription>{plan.blurb}</CardDescription>
            </CardHeader>
            <CardContent className="grid flex-1 content-start gap-4">
              <FeatureList items={plan.features} />
              {plan.laterFeatures ? (
                <div className="grid gap-2">
                  <p className="text-xs font-medium text-muted-foreground">{p.laterLabel}</p>
                  <FeatureList items={plan.laterFeatures} />
                </div>
              ) : null}
            </CardContent>
            <CardFooter>
              {plan.available ? (
                <a href={p.freeCtaHref} className={cn(buttonVariants({ variant: 'default' }), 'w-full')}>
                  {plan.cta}
                </a>
              ) : (
                <Button variant="outline" className="w-full" disabled>
                  {plan.cta}
                </Button>
              )}
            </CardFooter>
          </Card>
        ))}
      </div>

      <section aria-labelledby="pricing-notes" className="mt-12 max-w-3xl">
        <h2 id="pricing-notes" className="text-xl font-semibold tracking-tight">
          {p.notesTitle}
        </h2>
        <ul className="mt-4 grid list-disc gap-2 pl-5 text-sm text-pretty text-muted-foreground marker:text-primary">
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
