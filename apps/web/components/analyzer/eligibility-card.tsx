// Eligibility first (docs/03-UI-UX.md §1.4, §4.2; docs/08-BRAND-UI.md §6.5): the verdict line
// ("✓ Eligible from Morocco", glyph pops in), the job-post quote, open-to regions and guidance.
// "Not eligible" and "unclear" get a tinted card; the analyzer keeps this card first.
import type { EligibilityVerdict } from '@jobpilot/core/schemas';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { strings } from '@/lib/strings';
import type { PartialAnalysis } from '@/lib/client/partial';
import { EvidenceQuote } from './evidence-quote';
import { LABEL_CLASS, TONE_CLASSES, TONE_GLYPH, VERDICT_TONE } from './tone';

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
  const guidance =
    verdict === 'not_eligible' ? e.guidanceNotEligible : verdict === 'unclear' ? e.guidanceUnclear : null;

  return (
    <Card className={cn('h-full gap-3 py-4 sm:py-5', verdict !== 'eligible' && TONE_CLASSES[tone].surface)}>
      <CardContent className="grid content-start gap-3 px-4 sm:px-5">
        {/* On the tinted cards the quiet label would dip below AA in light mode: use muted there. */}
        <h3 className={cn(LABEL_CLASS, verdict !== 'eligible' && 'text-muted-foreground dark:text-muted-foreground')}>{e.title}</h3>
        <p className={cn('flex items-start gap-2.5 text-lg leading-snug font-semibold tracking-tight', TONE_CLASSES[tone].text)}>
          {/* Keyed on the verdict so it pops again if the server's check changes it. */}
          <span
            key={verdict}
            aria-hidden="true"
            className={cn(
              'grid size-7 shrink-0 animate-pop place-items-center rounded-full border font-mono text-sm',
              TONE_CLASSES[tone].border,
            )}
          >
            {TONE_GLYPH[tone]}
          </span>
          <span className="min-w-0 pt-0.5 break-words">{verdictLabel(verdict, countryName)}</span>
        </p>
        {evidenceQuote ? (
          <EvidenceQuote quote={evidenceQuote} source={strings.results.sources.jobPost} tone={tone} />
        ) : null}
        {reasoning ? <p className="text-sm text-pretty break-words text-foreground/90">{reasoning}</p> : null}
        {guidance ? <p className="text-sm text-muted-foreground">{guidance}</p> : null}
        {allowedRegions && allowedRegions.length > 0 ? (
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>{e.openTo}</span>
            {allowedRegions.map((region) => (
              <span
                key={region}
                className="rounded-full border border-border-strong px-2 py-0.5 font-mono text-[11px] break-all text-foreground/90"
              >
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
    <Card className="h-full gap-3 py-4 sm:py-5">
      <CardContent className="grid content-start gap-3 px-4 sm:px-5">
        <h3 className={LABEL_CLASS}>{strings.results.eligibility.title}</h3>
        <div className="flex items-center gap-2.5">
          <Skeleton className="size-7 shrink-0 rounded-full" />
          <Skeleton className="h-6 w-56 max-w-full" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </CardContent>
    </Card>
  );
}
