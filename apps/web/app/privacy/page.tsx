import { LegalPage } from '@/components/legal/legal-page';
import { pageMetadata } from '@/lib/site';
import { legalChrome, privacy } from '@/lib/strings-legal';

export const metadata = pageMetadata({
  title: legalChrome.pageTitle(privacy.title),
  description: privacy.description,
  path: '/privacy',
});

export default function PrivacyPage() {
  return <LegalPage doc={privacy} />;
}
