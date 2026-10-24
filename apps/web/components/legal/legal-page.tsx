// Shared layout for /privacy, /terms and /refund. Static server component: no client JS.
// Copy lives in lib/strings-legal.ts.
import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { legalChrome, type LegalDoc, type LegalText } from '@/lib/strings-legal';

const linkClass =
  'rounded-sm font-medium text-primary underline underline-offset-4 outline-none hover:text-primary/80 focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** Renders a paragraph or list item that may contain links. */
export function RichText({ value }: { value: LegalText }): ReactNode {
  if (typeof value === 'string') return value;
  return value.map((part, i) =>
    typeof part === 'string' ? (
      part
    ) : (
      <a key={i} href={part.href} className={linkClass}>
        {part.text}
      </a>
    ),
  );
}

/** Page shell shared with /pricing: header, centered main column, footer. */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col text-base">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:py-16">{children}</main>
      <SiteFooter />
    </div>
  );
}

export function LegalPage({ doc }: { doc: LegalDoc }) {
  const c = legalChrome;
  return (
    <PageShell>
      <article className="max-w-3xl">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{doc.title}</h1>
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            <time dateTime={c.lastUpdatedIso}>{c.lastUpdated}</time>
          </p>
        </header>

        <Card className="mt-8 gap-3 bg-muted/40 py-5">
          <CardHeader className="px-5">
            <CardTitle>{c.summaryTitle}</CardTitle>
          </CardHeader>
          <CardContent className="px-5">
            <ul className="grid list-disc gap-2 pl-5 text-sm text-pretty marker:text-primary">
              {doc.summary.map((item, i) => (
                <li key={i}>
                  <RichText value={item} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <nav aria-labelledby="on-this-page" className="mt-8">
          <h2 id="on-this-page" className="text-sm font-medium text-muted-foreground">
            {c.onThisPage}
          </h2>
          <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {doc.sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="rounded-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 grid gap-10">
          {doc.sections.map((s) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-6">
              <h2 id={`${s.id}-title`} className="text-xl font-semibold tracking-tight">
                {s.title}
              </h2>
              <div className="mt-3 grid gap-3 text-sm leading-relaxed text-pretty text-muted-foreground">
                {s.paragraphs?.map((p, i) => (
                  <p key={`p${i}`}>
                    <RichText value={p} />
                  </p>
                ))}
                {s.list ? (
                  <ul className="grid list-disc gap-2 pl-5 marker:text-primary">
                    {s.list.map((item, i) => (
                      <li key={`l${i}`}>
                        <RichText value={item} />
                      </li>
                    ))}
                  </ul>
                ) : null}
                {s.after?.map((p, i) => (
                  <p key={`a${i}`}>
                    <RichText value={p} />
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <Card className="mt-12 gap-2 py-5">
          <CardHeader className="px-5">
            <CardTitle>{c.contactTitle}</CardTitle>
          </CardHeader>
          <CardContent className="px-5 text-sm text-muted-foreground">
            <RichText value={c.contactBody} />
          </CardContent>
        </Card>
      </article>
    </PageShell>
  );
}
