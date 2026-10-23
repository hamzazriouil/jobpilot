import { BRAND_NAME } from '@jobpilot/core/brand';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    { ok: true, brand: BRAND_NAME },
    { headers: { 'cache-control': 'no-store' } },
  );
}
