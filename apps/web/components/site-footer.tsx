// Site footer. Links come from `strings.footer.links` (Pricing, Privacy, Terms, Refunds, Contact
// via mailto:SUPPORT_EMAIL, and GitHub once SOURCE_URL is set). Pass `links` to override.
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
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          {f.copyright(year)} <span aria-hidden="true">·</span> {f.builtWith}
        </p>
        <nav aria-label={f.navAriaLabel}>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {links.map((link) => (
              <li key={link.href + link.label}>
                <a
                  href={link.href}
                  className="rounded-sm underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  {...(link.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
