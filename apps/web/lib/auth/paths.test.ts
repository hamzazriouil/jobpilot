import { describe, expect, it } from 'vitest';
import { DEFAULT_AFTER_LOGIN, hasAuthCookie, isAppPath, safeNext } from './paths';

describe('isAppPath', () => {
  it('matches app routes and their children', () => {
    expect(isAppPath('/feed')).toBe(true);
    expect(isAppPath('/jobs/123')).toBe(true);
    expect(isAppPath('/onboarding')).toBe(true);
  });
  it('ignores public routes and look-alikes', () => {
    expect(isAppPath('/')).toBe(false);
    expect(isAppPath('/evals')).toBe(false);
    expect(isAppPath('/feeds')).toBe(false);
    expect(isAppPath('/login')).toBe(false);
  });
});

describe('safeNext', () => {
  it('keeps same-site paths with query and hash', () => {
    expect(safeNext('/jobs/abc?tab=drafts#x')).toBe('/jobs/abc?tab=drafts#x');
    expect(safeNext('/feed')).toBe('/feed');
  });
  it.each([
    null,
    undefined,
    '',
    'https://evil.example/feed',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    'feed',
    '/login',
    '/auth/callback?code=x',
    `/x${'a'.repeat(600)}`,
    '/\tfeed',
  ])('rejects %s', (raw) => {
    expect(safeNext(raw)).toBe(DEFAULT_AFTER_LOGIN);
  });
  it('uses the given fallback', () => {
    expect(safeNext('//x', '/onboarding')).toBe('/onboarding');
  });
});

describe('hasAuthCookie', () => {
  it('finds plain and chunked Supabase auth cookies', () => {
    expect(hasAuthCookie(['sb-abcd-auth-token'])).toBe(true);
    expect(hasAuthCookie(['theme', 'sb-abcd-auth-token.0'])).toBe(true);
  });
  it('ignores other cookies', () => {
    expect(hasAuthCookie([])).toBe(false);
    expect(hasAuthCookie(['jp.theme.v1', 'sb-other'])).toBe(false);
  });
});
