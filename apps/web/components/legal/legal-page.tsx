// Shared layout for /privacy, /terms and /refund. Static server component: no client JS.
// Copy lives in lib/strings-legal.ts.
import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { legalChrome, type LegalDoc, type LegalText } from '@/lib/strings-legal';

const linkClass =
  'rounded-sm font-medium text-signal-text underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50';

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

/** Page shell shared with /pricing and /evals: header, centered max-w-6xl main column, footer. */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col text-base">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6 sm:py-20">{children}</main>
      <SiteFooter />
    </div>
  );
}

export function LegalPage({ doc }: { doc: LegalDoc }) {
  const c = legalChrome;
  return (
    <PageShell>
      <article className="max-w-[68ch]">
        <header>
          <h1 className="text-4xl leading-[1.05] font-bold tracking-[-0.035em] text-balance sm:text-5xl">{doc.title}</h1>
          <p className="mt-4 font-mono text-xs text-muted-foreground">
            <time dateTime={c.lastUpdatedIso}>{c.lastUpdated}</time>
          </p>
        </header>

        <section aria-labelledby="summary-title" className="mt-10 rounded-xl border bg-card p-5 sm:p-6">
          <h2 id="summary-title" className="font-semibold tracking-tight">
            {c.summaryTitle}
          </h2>
          <ul className="mt-3 grid list-disc gap-2 pl-5 text-[15px] leading-relaxed text-pretty marker:text-signal-text">
            {doc.summary.map((item, i) => (
              <li key={i}>
                <RichText value={item} />
              </li>
            ))}
          </ul>
        </section>

        <nav aria-labelledby="on-this-page" className="mt-8">
          <h2 id="on-this-page" className="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
            {c.onThisPage}
          </h2>
          <ol className="mt-2 grid gap-x-4 text-sm sm:grid-cols-2">
            {doc.sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="inline-flex min-h-10 items-center rounded-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-12 grid gap-12">
          {doc.sections.map((s) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-24">
              <h2 id={`${s.id}-title`} className="text-2xl font-semibold tracking-[-0.03em]">
                {s.title}
              </h2>
              <div className="mt-4 grid gap-4 text-[15px] leading-relaxed text-pretty text-muted-foreground">
                {s.paragraphs?.map((p, i) => (
                  <p key={`p${i}`}>
                    <RichText value={p} />
                  </p>
                ))}
                {s.list ? (
                  <ul className="grid list-disc gap-2 pl-5 marker:text-signal-text">
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

        <section aria-labelledby="contact-title" className="mt-14 rounded-xl border bg-card p-5 sm:p-6">
          <h2 id="contact-title" className="font-semibold tracking-tight">
            {c.contactTitle}
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            <RichText value={c.contactBody} />
          </p>
        </section>
      </article>
    </PageShell>
  );
}
