import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { LABEL_CLASS } from '@/components/analyzer/tone';
import { DeleteAccount } from '@/components/settings/delete-account';
import { buttonVariants } from '@/components/ui/button';
import { LOGIN_PATH } from '@/lib/auth/paths';
import { loadPlan } from '@/lib/server/matching';
import { strings } from '@/lib/strings';
import { createSupabaseServer, getUser } from '@/lib/supabase/server';

// /settings (docs/03-UI-UX.md §4.12, W17): profile summary (edited in /onboarding, the same form),
// plan (Phase 2 fills in billing), and account: tracker CSV export and delete account. One page of
// sections instead of tabs: each section is short.

export const metadata = { title: strings.settings.title };

export default async function SettingsPage() {
  const s = strings.settings;
  const user = await getUser();
  if (!user) redirect(LOGIN_PATH);
  const supabase = await createSupabaseServer();
  const [{ data: profile }, plan] = await Promise.all([
    supabase.from('profiles').select('country_code, target_roles, seniority').eq('id', user.id).maybeSingle(),
    loadPlan(supabase, user.id),
  ]);

  const country = (() => {
    const code = profile?.country_code ? String(profile.country_code).trim() : null;
    if (!code) return null;
    try {
      return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
    } catch {
      return code;
    }
  })();
  const roles = (profile?.target_roles as string[] | null) ?? [];

  return (
    <section className="grid max-w-2xl gap-6">
      <h1 className="text-3xl font-bold tracking-[-0.03em]">{s.title}</h1>

      <Section title={s.profile.title}>
        <p className="text-sm text-pretty text-muted-foreground">{s.profile.body}</p>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
          <dt className="text-subtle">{s.profile.country}</dt>
          <dd>{country ?? s.profile.none}</dd>
          <dt className="text-subtle">{s.profile.roles}</dt>
          <dd>{roles.length ? roles.join(', ') : s.profile.none}</dd>
          <dt className="text-subtle">{s.profile.seniority}</dt>
          <dd className="capitalize">{profile?.seniority ?? s.profile.none}</dd>
        </dl>
        <a href="/onboarding" className={`${buttonVariants({ variant: 'outline', size: 'sm' })} mt-4`}>
          {s.profile.edit}
        </a>
      </Section>

      <Section title={s.billing.title}>
        <p className="font-medium">{plan === 'free' ? s.billing.free : plan}</p>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">{s.billing.body}</p>
        <a href="/pricing" className={`${buttonVariants({ variant: 'outline', size: 'sm' })} mt-4`}>
          {s.billing.pricing}
        </a>
      </Section>

      <Section title={s.account.title}>
        <p className="text-sm">
          <span className="text-subtle">{s.account.email} </span>
          <span className="font-mono">{user.email}</span>
        </p>
        <div className="mt-5 border-t pt-5">
          <a href="/api/applications/export" download className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            {s.account.export}
          </a>
          <p className="mt-2 text-xs text-subtle">{s.account.exportHint}</p>
        </div>
        <div className="mt-5 border-t pt-5">
          <DeleteAccount />
        </div>
      </Section>
    </section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border bg-card px-4 py-5 sm:px-6">
      <h2 className={`${LABEL_CLASS} mb-3`}>{title}</h2>
      {children}
    </section>
  );
}
