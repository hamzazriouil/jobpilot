import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { AppNav } from '@/components/app/app-nav';
import { LOGIN_PATH } from '@/lib/auth/paths';
import { getUser } from '@/lib/supabase/server';

// Layout for signed-in pages (/onboarding, /feed, /jobs/*, /tracker, /stats, /settings).
// middleware.ts already redirects signed-out visitors; this check is the second line of defense
// for a session that expired between the middleware and the render.

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false } };

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getUser();
  if (!user) redirect(LOGIN_PATH);
  return (
    <div className="flex min-h-dvh flex-col text-base">
      <AppHeader email={user.email} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-24 sm:px-6 sm:py-12">{children}</main>
      <AppNav variant="bottom" />
    </div>
  );
}
