// Public base URL + per-page metadata helper (sitemap, robots, canonical links, Open Graph).
// `APP_URL` wins when it is set at build time; otherwise SITE_URL from packages/core/brand.ts.
import type { Metadata } from 'next';
import { BRAND_NAME, BRAND_TAGLINE, SITE_URL } from '@jobpilot/core/brand';

function resolveBaseUrl(): URL {
  for (const candidate of [process.env.APP_URL, SITE_URL]) {
    if (!candidate) continue;
    try {
      return new URL(candidate);
    } catch {
      // not a valid URL: try the next one
    }
  }
  return new URL('http://localhost:3000');
}

export const BASE_URL: URL = resolveBaseUrl();

/** Absolute URL for a path on this site, e.g. absoluteUrl('/privacy'). */
export function absoluteUrl(path: string): string {
  return new URL(path, BASE_URL).toString();
}

/** Public, indexable pages (sitemap.ts). */
export const PUBLIC_PATHS = ['/', '/pricing', '/privacy', '/terms', '/refund'] as const;

/**
 * Shared social image, a static file (public/og-image.png, made by scripts/generate-og-image.mjs).
 * Set explicitly on every page: a page's own `openGraph` replaces the layout's, image included.
 */
export const OG_IMAGE = {
  url: '/og-image.png',
  width: 1200,
  height: 630,
  type: 'image/png',
  alt: `${BRAND_NAME}: ${BRAND_TAGLINE}`,
} as const;

/** Metadata for a page: `<title>`, description, canonical URL, Open Graph and Twitter card. */
export function pageMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: 'website', siteName: BRAND_NAME, title, description, url: path, images: [OG_IMAGE] },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE] },
  };
}
