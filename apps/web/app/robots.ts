import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/site';

// Static at build time. The API is never useful to crawlers.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/api/' },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
