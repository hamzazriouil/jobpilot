import { describe, expect, it, vi } from 'vitest';
import { deleteAuthUser, SupabaseError } from './supabase';

const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: 'service-key' };

describe('deleteAuthUser', () => {
  it('calls the Auth admin API with the service role', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    await deleteAuthUser(env, 'u-1', fetchImpl as unknown as typeof fetch);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://x.supabase.co/auth/v1/admin/users/u-1');
    expect(init.method).toBe('DELETE');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer service-key');
  });

  it('treats an already deleted user as done, and throws on other errors', async () => {
    const gone = vi.fn(async () => new Response('', { status: 404 }));
    await expect(deleteAuthUser(env, 'u-1', gone as unknown as typeof fetch)).resolves.toBeUndefined();
    const broken = vi.fn(async () => new Response('nope', { status: 500 }));
    await expect(deleteAuthUser(env, 'u-1', broken as unknown as typeof fetch)).rejects.toBeInstanceOf(SupabaseError);
  });

  it('refuses to run without the service role', async () => {
    await expect(deleteAuthUser({}, 'u-1')).rejects.toThrow(/not configured/);
  });
});
