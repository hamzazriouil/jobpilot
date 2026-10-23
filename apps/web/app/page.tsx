import { ArrowRight } from 'lucide-react';
import { BRAND_NAME } from '@jobpilot/core/brand';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { strings } from '@/lib/strings';

// Placeholder landing page (Day 1). The real AnalyzerForm arrives on Day 2.
export default function HomePage() {
  const s = strings;
  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-dvh flex-col text-base">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
          <a href="/" aria-label={s.header.homeAriaLabel} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="grid size-7 place-items-center rounded-md bg-primary font-mono text-sm font-semibold text-primary-foreground"
            >
              {BRAND_NAME.charAt(0)}
            </span>
            <span className="font-semibold tracking-tight">{s.header.brand}</span>
          </a>
          <Badge variant="secondary" className="font-mono">
            {s.header.comingSoonBadge}
          </Badge>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:py-16">
        <section className="max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {s.hero.title}
          </h1>
          <p className="mt-4 text-pretty text-muted-foreground">{s.hero.subtitle}</p>
          <p className="mt-3 font-mono text-xs text-muted-foreground">{s.hero.trustLine}</p>
        </section>

        <section aria-label={s.analyzer.sectionAriaLabel} className="mt-10">
          <Card>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <div className="grid gap-2">
                <label htmlFor="cv" className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {s.analyzer.cvLabel}
                </label>
                <Textarea id="cv" disabled placeholder={s.analyzer.cvPlaceholder} className="min-h-40 md:min-h-56" />
              </div>
              <div className="grid gap-2">
                <label htmlFor="job" className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {s.analyzer.jobLabel}
                </label>
                <Textarea id="job" disabled placeholder={s.analyzer.jobPlaceholder} className="min-h-40 md:min-h-56" />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">{s.analyzer.comingSoonNote}</p>
              <Button disabled className="sm:w-auto">
                {s.analyzer.submit}
                <ArrowRight aria-hidden="true" />
              </Button>
            </CardFooter>
          </Card>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{s.footer.copyright(year)}</p>
          <p className="flex items-center gap-2">
            <span>{s.footer.builtWith}</span>
            <span aria-hidden="true">·</span>
            <a
              href={s.footer.sourceHref}
              className="underline-offset-4 hover:text-foreground hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              {s.footer.sourceLink}
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
