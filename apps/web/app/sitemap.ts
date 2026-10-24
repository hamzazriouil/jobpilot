import type { MetadataRoute } from 'next';
import { LEGAL_LAST_UPDATED } from '@jobpilot/core/brand';
import { PUBLIC_PATHS, absoluteUrl } from '@/lib/site';

// Static at build time. Legal pages use their "last updated" date.
const LEGAL = new Set<string>(['/privacy', '/terms', '/refund']);

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({
    url: absoluteUrl(path),
    ...(LEGAL.has(path) ? { lastModified: LEGAL_LAST_UPDATED } : {}),
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority: path === '/' ? 1 : path === '/pricing' ? 0.8 : 0.3,
  }));
}
