import { NewJobForm } from '@/components/jobs/new-job-form';
import { strings } from '@/lib/strings';

// /jobs/new (docs/03-UI-UX.md §4.7). The (app) layout guarantees a signed-in user.

export const metadata = { title: strings.jobs.new.title };

export default function NewJobPage() {
  return <NewJobForm />;
}
