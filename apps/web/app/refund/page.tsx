import { LegalPage } from '@/components/legal/legal-page';
import { pageMetadata } from '@/lib/site';
import { legalChrome, refund } from '@/lib/strings-legal';

// TODO(founder): the refund terms are a PROPOSAL (see REFUND in lib/strings-legal.ts). Confirm
// them before checkout goes live.

export const metadata = pageMetadata({
  title: legalChrome.pageTitle(refund.title),
  description: refund.description,
  path: '/refund',
});

export default function RefundPage() {
  return <LegalPage doc={refund} />;
}
