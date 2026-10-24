// Eligibility first (docs/03-UI-UX.md §1.4, §4.2): verdict badge + job-post quote + guidance.
// "Not eligible" gets a red card; the analyzer keeps it on top of everything else.
import { CircleAlert, CircleCheck, CircleX } from 'lucide-react';
import type { EligibilityVerdict } from '@jobpilot/core/schemas';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { strings } from '@/lib/strings';
import type { PartialAnalysis } from '@/lib/client/partial';
import { EvidenceQuote } from './evidence-quote';
import { TONE_CLASSES, VERDICT_TONE } from './tone';

const VERDICT_ICON = { eligible: CircleCheck, unclear: CircleAlert, not_eligible: CircleX } as const;

export function verdictLabel(verdict: EligibilityVerdict, countryName: string): string {
  const e = strings.results.eligibility;
  if (verdict === 'eligible') return e.eligible(countryName);
  if (verdict === 'not_eligible') return e.notEligible(countryName);
  return e.unclear;
}

export function EligibilityCard({
  eligibility,
  countryName,
}: {
  eligibility: NonNullable<PartialAnalysis['eligibility']>;
  countryName: string;
}) {
  const e = strings.results.eligibility;
  const { verdict, evidenceQuote, reasoning, allowedRegions } = eligibility;
  if (!verdict) return <EligibilitySkeleton />;

  const tone = VERDICT_TONE[verdict];
  const Icon = VERDICT_ICON[verdict];
  const guidance =
    verdict === 'not_eligible' ? e.guidanceNotEligible : verdict === 'unclear' ? e.guidanceUnclear : null;

  return (
    <Card className={cn('gap-3 py-5', verdict !== 'eligible' && TONE_CLASSES[tone].surface)}>
      <CardContent className="grid gap-3 px-4 sm:px-6">
        <h3 className="font-mono text-xs font-medium tracking-wide text-muted-foreground uppercase">{e.title}</h3>
        <p className={cn('flex items-start gap-2 text-lg font-semibold', TONE_CLASSES[tone].text)}>
          <Icon aria-hidden="true" className={cn('mt-1 size-5 shrink-0', TONE_CLASSES[tone].icon)} />
          <span>{verdictLabel(verdict, countryName)}</span>
        </p>
        {evidenceQuote ? (
          <EvidenceQuote quote={evidenceQuote} source={strings.results.sources.jobPost} tone={tone} />
        ) : null}
        {reasoning ? <p className="text-sm text-pretty">{reasoning}</p> : null}
        {guidance ? <p className="text-sm text-muted-foreground">{guidance}</p> : null}
        {allowedRegions && allowedRegions.length > 0 ? (
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>{e.openTo}</span>
            {allowedRegions.map((region) => (
              <span key={region} className="rounded border px-1.5 py-0.5 font-mono text-[11px]">
                {region}
              </span>
            ))}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function EligibilitySkeleton() {
  return (
    <Card className="gap-3 py-5">
      <CardContent className="grid gap-3 px-4 sm:px-6">
        <h3 className="font-mono text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {strings.results.eligibility.title}
        </h3>
        <Skeleton className="h-6 w-56 max-w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </CardContent>
    </Card>
  );
}
