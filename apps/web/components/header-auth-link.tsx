'use client';

// "Sign in" / "Open app" link in the public header. It checks for the Supabase session cookie in
// the browser instead of on the server, so public pages stay static (no cookies() call). It's only a
// hint for which link to show: /feed itself is guarded by middleware.ts.
import { useEffect, useState } from 'react';
import { DEFAULT_AFTER_LOGIN, hasAuthCookie, LOGIN_PATH } from '@/lib/auth/paths';
import { strings } from '@/lib/strings';
import { cn } from '@/lib/utils';

export function HeaderAuthLink({ className }: { className?: string }) {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const names = document.cookie.split(';').map((c) => c.split('=')[0]!.trim());
    setSignedIn(hasAuthCookie(names));
  }, []);

  return (
    <a href={signedIn ? DEFAULT_AFTER_LOGIN : LOGIN_PATH} className={cn(className)}>
      {signedIn ? strings.auth.openApp : strings.auth.signIn}
    </a>
  );
}
