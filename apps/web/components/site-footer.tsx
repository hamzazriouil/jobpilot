// Site footer. Links come from `strings.footer.links` (Evals, Pricing, Privacy, Terms, Refunds,
// Contact via mailto:SUPPORT_EMAIL, and GitHub once SOURCE_URL is set). Pass `links` to override.
import { BrandMark } from '@/components/brand-mark';
import { strings } from '@/lib/strings';

export interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

export function SiteFooter({ links = strings.footer.links }: { links?: ReadonlyArray<FooterLink> }) {
  const f = strings.footer;
  const year = new Date().getFullYear();
  return (
    <footer className="border-t">
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-10 text-sm text-muted-foreground sm:px-6 md:grid-cols-[auto_1fr_auto] md:items-center md:gap-8">
        <div className="flex items-center gap-2.5">
          <BrandMark className="size-6" />
          <span className="font-semibold tracking-[-0.02em] text-foreground">{strings.header.brand}</span>
          <span className="ml-1">{f.copyright(year)}</span>
        </div>
        <nav aria-label={f.navAriaLabel} className="md:justify-self-center">
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-0">
            {links.map((link) => (
              <li key={link.href + link.label}>
                <a
                  href={link.href}
                  className="inline-flex min-h-10 items-center rounded-sm underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  {...(link.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <p className="font-mono text-xs">{f.builtWith}</p>
      </div>
    </footer>
  );
}
