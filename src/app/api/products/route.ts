import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, detectSQLi, detectXSS, recordSecurityEvent } from '@/lib/security';
import {
  filterPublicProductCatalog,
  getPublicProductCatalog,
} from '@/lib/public-product-catalog';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const requestId = req.headers.get('x-request-id') || `req-${Date.now()}`;
  const { searchParams } = new URL(req.url);

  const game = searchParams.get('game');
  const subCategory1 = searchParams.get('subCategory1');
  const subCategory2 = searchParams.get('subCategory2');
  const search = searchParams.get('search');
  const sort = searchParams.get('sort') || 'popular';

  // Check for injection in search query
  if (search) {
    if (detectSQLi(search) || detectXSS(search)) {
      const eventType = detectSQLi(search) ? 'sql_injection_attempt' : 'xss_attempt';
      await recordSecurityEvent({
        eventType,
        severity: detectSQLi(search) ? 'high' : 'medium',
        ipAddress: ip,
        method: 'GET',
        endpoint: req.nextUrl.pathname + req.nextUrl.search,
        userAgent: req.headers.get('user-agent') || 'Unknown',
        payloadSnippet: `search=${search}`,
        statusCode: 400,
        description: 'Malicious pattern in product search',
        requestId,
      });

      return NextResponse.json(
        { error: 'Bad Request', message: 'Invalid search parameter format' },
        { status: 400 }
      );
    }
  }

  // One small RDS query warms a server-side cache for the whole catalog.
  // Filtering is then performed in memory, so changing tabs does not trigger
  // another database round-trip.
  const catalog = await getPublicProductCatalog();
  const list = filterPublicProductCatalog(catalog, {
    game,
    subCategory1,
    subCategory2,
    search,
    sort,
  });

  return NextResponse.json(
    {
      success: true,
      count: list.length,
      data: list,
      products: list,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=120',
      },
    }
  );
}
