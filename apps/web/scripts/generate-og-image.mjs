// Renders public/og-image.png (1200×630) from packages/core/src/brand.ts. It is referenced by
// OG_IMAGE in lib/site.ts (layout + every page's metadata), and served as a static asset.
//
// Why a static file instead of app/opengraph-image.tsx: OpenNext/Cloudflare supports `next/og`, but
// any route that uses it pulls @vercel/og (~800 KiB) plus resvg.wasm and yoga.wasm into the Worker
// bundle (see @opennextjs/cloudflare dist/cli/build/bundle-server.js). That is a lot of the 3 MiB
// free-plan Worker limit for one image that never changes. So we render it once, here, with the
// same `next/og` renderer, and commit the PNG. (It is in public/ rather than app/opengraph-image.png
// because pages that set their own `openGraph` metadata drop the inherited file-based image.)
//
// Re-run after changing BRAND_NAME or BRAND_TAGLINE (Node 22.18+ / 24, which can import .ts):
//   node apps/web/scripts/generate-og-image.mjs
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import * as og from 'next/og.js'; // `next` has no "exports" map, so ESM needs the .js
import { BRAND_NAME, BRAND_TAGLINE } from '../../../packages/core/src/brand.ts';

const ImageResponse = og.ImageResponse ?? og.default?.ImageResponse;
const here = dirname(fileURLToPath(import.meta.url));
const outFile = join(here, '..', 'public', 'og-image.png');

const WIDTH = 1200;
const HEIGHT = 630;
const INDIGO = '#4F46E5';
const INDIGO_LIGHT = '#818CF8';
const BG = '#09090b';
const FG = '#fafafa';
const MUTED = '#a1a1aa';

const checkSvg = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M9 16.5l4.5 4.5L23 11.5" fill="none" stroke="#ffffff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
)}`;

const pill = (text) =>
  h(
    'div',
    {
      style: {
        display: 'flex',
        padding: '10px 20px',
        borderRadius: 999,
        border: '1px solid #3f3f46',
        color: FG,
        fontSize: 26,
      },
    },
    text,
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
      padding: '72px 80px',
      background: BG,
      backgroundImage: `radial-gradient(circle at 85% 15%, rgba(79,70,229,0.45), transparent 45%)`,
      color: FG,
      fontFamily: 'sans-serif',
    },
  },
  // Brand row
  h(
    'div',
    { style: { display: 'flex', alignItems: 'center', gap: 20 } },
    h(
      'div',
      {
        style: {
          width: 64,
          height: 64,
          borderRadius: 14,
          background: INDIGO,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
      },
      h('img', { src: checkSvg, width: 48, height: 48 }),
    ),
    h('div', { style: { fontSize: 40, fontWeight: 700, letterSpacing: -1 } }, BRAND_NAME),
  ),
  // Tagline
  h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: 24 } },
    h(
      'div',
      { style: { fontSize: 76, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2, maxWidth: 980 } },
      BRAND_TAGLINE,
    ),
    h(
      'div',
      { style: { fontSize: 32, color: MUTED, maxWidth: 940, lineHeight: 1.35 } },
      'Paste your CV and a remote job post. Find out if you can apply from your country, with an honest fit score.',
    ),
  ),
  // Feature pills
  h(
    'div',
    { style: { display: 'flex', gap: 16, alignItems: 'center' } },
    pill('Eligibility check'),
    pill('Fit score with evidence'),
    pill('Cover letter + cold DM'),
    h('div', { style: { display: 'flex', marginLeft: 'auto', color: INDIGO_LIGHT, fontSize: 26 } }, 'No signup'),
  ),
);

const res = new ImageResponse(tree, { width: WIDTH, height: HEIGHT });
const png = Buffer.from(await res.arrayBuffer());
await writeFile(outFile, png);
console.log(`Wrote public/og-image.png (${png.length} bytes)`);
