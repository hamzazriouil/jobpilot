// Below-the-analyzer landing content (docs/03-UI-UX.md §4.1, §9): how it works, what we check,
// privacy in one line, FAQ. Static server component: no client JS.
import Link from 'next/link';
import { strings } from '@/lib/strings';

export function LandingSections() {
  const l = strings.landing;
  return (
    <div className="mt-16 grid gap-12 border-t pt-12 sm:mt-20">
      <section aria-labelledby="how-it-works">
        <h2 id="how-it-works" className="text-xl font-semibold tracking-tight">
          {l.howItWorks.title}
        </h2>
        <ol className="mt-5 grid gap-4 sm:grid-cols-3">
          {l.howItWorks.steps.map((step, i) => (
            <li key={step.title} className="rounded-lg border p-4">
              <p className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, '0')}</p>
              <p className="mt-1 font-medium">{step.title}</p>
              <p className="mt-1 text-sm text-pretty text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-12 md:grid-cols-2">
        <section aria-labelledby="what-we-check">
          <h2 id="what-we-check" className="text-xl font-semibold tracking-tight">
            {l.whatWeCheck.title}
          </h2>
          <ul className="mt-4 grid list-disc gap-2 pl-5 text-sm text-muted-foreground marker:text-primary">
            {l.whatWeCheck.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="privacy-line">
          <h2 id="privacy-line" className="text-xl font-semibold tracking-tight">
            {l.privacy.title}
          </h2>
          <p className="mt-4 text-sm text-pretty text-muted-foreground">
            {l.privacy.body}{' '}
            <Link href={l.privacy.linkHref} className="font-medium text-foreground underline underline-offset-4">
              {l.privacy.linkLabel}
            </Link>
          </p>
        </section>
      </div>

      <section aria-labelledby="faq">
        <h2 id="faq" className="text-xl font-semibold tracking-tight">
          {l.faq.title}
        </h2>
        <div className="mt-4 divide-y rounded-lg border">
          {l.faq.items.map((item) => (
            <details key={item.q} className="group px-4 py-3">
              <summary className="cursor-pointer list-none rounded-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                <span aria-hidden="true" className="mr-2 inline-block font-mono text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none">
                  ›
                </span>
                {item.q}
              </summary>
              <p className="mt-2 pl-5 text-sm text-pretty text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
