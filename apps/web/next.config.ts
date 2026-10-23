import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

const nextConfig: NextConfig = {
  // packages/core ships raw TypeScript, so Next must compile it.
  transpilePackages: ['@jobpilot/core'],
  poweredByHeader: false,
};

export default nextConfig;

// Makes Cloudflare bindings available through getCloudflareContext() during `next dev` only.
// Workers AI (`AI`) is a remote-only binding: it needs Cloudflare auth (`npx wrangler login`
// or CLOUDFLARE_API_TOKEN). It is off by default so `next dev` works without an account;
// set CF_REMOTE_BINDINGS=1 to call the real Workers AI from local dev.
if (process.env.NODE_ENV === 'development') {
  void initOpenNextCloudflareForDev({ remoteBindings: process.env.CF_REMOTE_BINDINGS === '1' });
}
