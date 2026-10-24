// Renders public/og-image.png (1200×630) in the "Signal" look (docs/08-BRAND-UI.md §8): void
// background, mark + wordmark, the hero h1, a three-line mini trace and the evals pill. It is
// referenced by OG_IMAGE in lib/site.ts (layout + every page's metadata), and served as a static asset.
//
// Why a static file instead of app/opengraph-image.tsx: OpenNext/Cloudflare supports `next/og`, but
// any route that uses it pulls @vercel/og (~800 KiB) plus resvg.wasm and yoga.wasm into the Worker
// bundle (see @opennextjs/cloudflare dist/cli/build/bundle-server.js). That is a lot of the 3 MiB
// free-plan Worker limit for one image that never changes. So we render it once, here, with the
// same `next/og` renderer, and commit the PNG. (It is in public/ rather than app/opengraph-image.png
// because pages that set their own `openGraph` metadata drop the inherited file-based image.)
//
// Copy comes from lib/strings.ts (hero) and the trace lines from lib/landing/demo-trace.ts (the
// tested sample), so re-run after changing them or BRAND_NAME (Node 22.18+ / 24, which can import .ts):
//   node apps/web/scripts/generate-og-image.mjs
// Geist / Geist Mono are fetched from Google Fonts; offline, the renderer's default font is used.
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import * as og from 'next/og.js'; // `next` has no "exports" map, so ESM needs the .js
import { BRAND_NAME } from '../../../packages/core/src/brand.ts';
import { strings } from '../lib/strings.ts';
import { DEMO_LINES } from '../lib/landing/demo-trace.ts';

const ImageResponse = og.ImageResponse ?? og.default?.ImageResponse;
const here = dirname(fileURLToPath(import.meta.url));
const outFile = join(here, '..', 'public', 'og-image.png');

const WIDTH = 1200;
const HEIGHT = 630;
const C = {
  bg: '#0A0A0B',
  card: '#111113',
  border: '#1F1F23',
  borderStrong: '#2E2E34',
  fg: '#EDEDEF',
  muted: '#A1A1AA',
  subtle: '#6E6E78',
  signal: '#C6F432',
  partial: '#FFB020',
  miss: '#FF6B6B',
};

const svgUri = (svg) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

// Same drawing as components/brand-mark.tsx and app/icon.svg.
const MARK = svgUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><rect x="1" y="1" width="26" height="26" rx="7" fill="#C6F432"/><path d="M6 15h4l2-6 4 11 2-5h4" fill="none" stroke="#0A0A0B" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
);

// Status glyphs as SVG so they render without a font that has ✓ / ◐ / ✕.
const GLYPH = {
  eligible: { color: C.signal, svg: `<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="${C.signal}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` },
  met: { color: C.signal, svg: `<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="${C.signal}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` },
  partial: { color: C.partial, svg: `<circle cx="12" cy="12" r="7.5" fill="none" stroke="${C.partial}" stroke-width="2.2"/><path d="M12 4.5a7.5 7.5 0 0 0 0 15z" fill="${C.partial}"/>` },
  missing: { color: C.miss, svg: `<path d="M7 7l10 10M17 7L7 17" fill="none" stroke="${C.miss}" stroke-width="2.6" stroke-linecap="round"/>` },
};
const glyphUri = (status) => svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${GLYPH[status].svg}</svg>`);

const hero = strings.hero;
const demo = strings.demo;
const traceLines = DEMO_LINES.filter((l) => l.kind === 'claim').slice(0, 3);

// ── Fonts (optional) ──
async function googleFont(family, weight, text) {
  const url = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(url, { signal: AbortSignal.timeout(8000) })).text();
  const m = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/);
  if (!m) throw new Error(`no TTF for ${family} ${weight}`);
  const res = await fetch(m[1], { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`font download failed: ${res.status}`);
  return res.arrayBuffer();
}

const sansText = `${BRAND_NAME}${hero.title}${hero.titleMuted}`;
const monoText = `${hero.evalsPill}${traceLines.map((l) => `${l.key}${demo.status[l.status]}${l.text}`).join('')}`;
let fonts;
try {
  fonts = [
    { name: 'Geist', data: await googleFont('Geist', 600, sansText), weight: 600, style: 'normal' },
    { name: 'Geist', data: await googleFont('Geist', 700, sansText), weight: 700, style: 'normal' },
    { name: 'Geist Mono', data: await googleFont('Geist Mono', 400, monoText), weight: 400, style: 'normal' },
  ];
  console.log('Using Geist / Geist Mono from Google Fonts.');
} catch (err) {
  fonts = undefined;
  console.log(`Could not load Geist (${err?.message ?? err}); using the default font.`);
}
const SANS = fonts ? 'Geist' : 'sans-serif';
const MONO = fonts ? 'Geist Mono' : 'sans-serif';

// ── Layout ──
const pill = h(
  'div',
  {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 20px 10px 16px',
      borderRadius: 999,
      border: `1px solid ${C.borderStrong}`,
      color: C.muted,
      fontFamily: MONO,
      fontSize: 20,
    },
  },
  h('div', {
    style: { width: 10, height: 10, borderRadius: 99, background: C.signal, boxShadow: `0 0 0 5px rgba(198,244,50,0.18)` },
  }),
  hero.evalsPill,
);

const traceRow = (line) =>
  h(
    'div',
    { style: { display: 'flex', alignItems: 'center', fontFamily: MONO, fontSize: 24 } },
    h('div', { style: { display: 'flex', width: 140, color: C.subtle } }, line.key),
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: 8, width: 170, color: GLYPH[line.status].color } },
      h('img', { src: glyphUri(line.status), width: 24, height: 24 }),
      demo.status[line.status],
    ),
    h('div', { style: { display: 'flex', color: C.fg } }, line.text),
  );

const tree = h(
  'div',
  {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '60px 72px 64px',
      background: C.bg,
      color: C.fg,
      fontFamily: SANS,
    },
  },
  // Brand row + evals pill
  h(
    'div',
    { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: 16 } },
      h('img', { src: MARK, width: 52, height: 52 }),
      h('div', { style: { fontSize: 36, fontWeight: 600, letterSpacing: -0.72 } }, BRAND_NAME),
    ),
    pill,
  ),
  // Hero h1, two lines
  h(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        fontSize: 76,
        fontWeight: 700,
        lineHeight: 1.0,
        letterSpacing: -3.4,
      },
    },
    h('div', { style: { display: 'flex' } }, hero.title),
    h('div', { style: { display: 'flex', color: C.subtle } }, hero.titleMuted),
  ),
  // Mini trace
  h(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        padding: '22px 28px',
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
      },
    },
    ...traceLines.map(traceRow),
  ),
);

const res = new ImageResponse(tree, { width: WIDTH, height: HEIGHT, ...(fonts ? { fonts } : {}) });
const png = Buffer.from(await res.arrayBuffer());
await writeFile(outFile, png);
console.log(`Wrote public/og-image.png (${png.length} bytes)`);
