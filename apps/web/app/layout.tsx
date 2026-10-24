import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { BRAND_NAME } from '@jobpilot/core/brand';
import { BASE_URL, OG_IMAGE } from '@/lib/site';
import { strings } from '@/lib/strings';
import { THEME_INIT_SCRIPT } from '@/lib/client/theme';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  // metadataBase turns relative URLs (canonical, og:url, og:image) into absolute ones.
  metadataBase: BASE_URL,
  title: strings.meta.title,
  description: strings.meta.description,
  // Defaults for pages without their own metadata. No canonical/og:url here: they would be inherited
  // by every child page. Pages with their own metadata use pageMetadata() from lib/site.ts.
  openGraph: {
    type: 'website',
    siteName: BRAND_NAME,
    title: strings.meta.title,
    description: strings.meta.description,
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: strings.meta.title,
    description: strings.meta.description,
    images: [OG_IMAGE],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: THEME_INIT_SCRIPT may add `light`/`dark` to <html> before React hydrates.
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
