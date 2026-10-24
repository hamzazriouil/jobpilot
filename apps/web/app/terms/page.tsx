import { LegalPage } from '@/components/legal/legal-page';
import { pageMetadata } from '@/lib/site';
import { legalChrome, terms } from '@/lib/strings-legal';

export const metadata = pageMetadata({
  title: legalChrome.pageTitle(terms.title),
  description: terms.description,
  path: '/terms',
});

export default function TermsPage() {
  return <LegalPage doc={terms} />;
}
