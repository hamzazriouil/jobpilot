// Below-the-analyzer landing content (docs/03-UI-UX.md §4.1, §9; docs/08-BRAND-UI.md §6.6): how it
// works, what we check, privacy in one line, FAQ. Static server component: no client JS.
import Link from 'next/link';
import { strings } from '@/lib/strings';

const h2Class = 'text-[28px] leading-tight font-semibold tracking-[-0.03em] text-balance sm:text-4xl';

export function LandingSections() {
  const l = strings.landing;
  return (
    <div className="mt-16 sm:mt-24">
      <section aria-labelledby="how-it-works-title" id="how-it-works" className="border-t py-16 sm:py-24">
        <h2 id="how-it-works-title" className={h2Class}>
          {l.howItWorks.title}
        </h2>
        <ol className="mt-8 grid gap-4 sm:mt-10 md:grid-cols-3 md:gap-5">
          {l.howItWorks.steps.map((step, i) => (
            <li key={step.title} className="rounded-xl border bg-card p-6">
              <p className="font-mono text-sm text-signal-text">{String(i + 1).padStart(2, '0')}</p>
              <p className="mt-4 text-lg font-semibold tracking-[-0.02em]">{step.title}</p>
              <p className="mt-2 text-[15px] leading-relaxed text-pretty text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-12 border-t py-16 sm:py-24 md:grid-cols-2 md:gap-8">
        <section aria-labelledby="what-we-check">
          <h2 id="what-we-check" className={h2Class}>
            {l.whatWeCheck.title}
          </h2>
          <ul className="mt-8 grid gap-3.5 rounded-xl border bg-card p-5 font-mono text-[13px] leading-relaxed sm:p-6 sm:text-sm">
            {l.whatWeCheck.items.map((item) => (
              <li key={item} className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-2">
                <span aria-hidden="true" className="text-signal-text">
                  ✓
                </span>
                <span className="text-pretty">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="privacy-line">
          <h2 id="privacy-line" className={h2Class}>
            {l.privacy.title}
          </h2>
          <div className="mt-8 rounded-xl border bg-card p-5 sm:p-6">
            <p className="text-[15px] leading-relaxed text-pretty text-muted-foreground">{l.privacy.body}</p>
            <Link
              href={l.privacy.linkHref}
              className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-sm font-medium text-signal-text underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {l.privacy.linkLabel}
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
      </div>

      <section aria-labelledby="faq" className="border-t py-16 sm:py-24">
        <h2 id="faq" className={h2Class}>
          {l.faq.title}
        </h2>
        <div className="mt-8 max-w-3xl divide-y border-y">
          {l.faq.items.map((item) => (
            <details key={item.q} className="group">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-sm py-3 text-base font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:text-lg [&::-webkit-details-marker]:hidden">
                <span className="text-pretty">{item.q}</span>
                <span aria-hidden="true" className="shrink-0 font-mono text-lg text-muted-foreground">
                  <span className="group-open:hidden">+</span>
                  <span className="hidden group-open:inline">–</span>
                </span>
              </summary>
              <p className="pb-5 text-[15px] leading-relaxed text-pretty text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
