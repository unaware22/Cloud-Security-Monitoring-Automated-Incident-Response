import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getClientIp, detectSQLi, detectXSS, recordSecurityEvent } from '@/lib/security';
import { fallbackStore } from '@/lib/products-store';
import { isDatabaseOnline } from '@/lib/db-store';

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

  // Fast offline check
  const dbOnline = await isDatabaseOnline();

  if (dbOnline) {
    try {
      const where: any = { isActive: true };

      if (game && game !== 'all') {
        where.game = game.toLowerCase();
      }
      if (subCategory1 && subCategory1 !== 'all') {
        where.subCategory1 = subCategory1.toLowerCase();
      }
      if (subCategory2 && subCategory2 !== 'all') {
        where.subCategory2 = subCategory2.toLowerCase();
      }
      if (search && search.trim()) {
        where.OR = [
          { name: { contains: search.trim(), mode: 'insensitive' } },
          { description: { contains: search.trim(), mode: 'insensitive' } },
        ];
      }

      let orderBy: any = [{ sortOrder: 'asc' }, { createdAt: 'desc' }];
      if (sort === 'price_asc') {
        orderBy = { price: 'asc' };
      } else if (sort === 'price_desc') {
        orderBy = { price: 'desc' };
      } else if (sort === 'popular') {
        orderBy = [{ sortOrder: 'asc' }, { stock: 'desc' }];
      }

      const products = await prisma.product.findMany({
        where,
        orderBy,
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          price: true,
          stock: true,
          sortOrder: true,
          productType: true,
          imageUrl: true,
          game: true,
          subCategory1: true,
          subCategory2: true,
          deliveryType: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (products && products.length > 0) {
        return NextResponse.json({
          success: true,
          count: products.length,
          data: products,
          products: products,
        });
      }
    } catch {
      // Fallback below
    }
  }

  // Instant In-Memory Fallback (0ms latency)
  let list = fallbackStore.getProducts({
    game: game ? String(game) : undefined,
    subCategory1: subCategory1 ? String(subCategory1) : undefined,
    subCategory2: subCategory2 ? String(subCategory2) : undefined,
    isActive: true,
  });

  if (search && search.trim()) {
    const s = search.trim().toLowerCase();
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(s) ||
        (p.description && p.description.toLowerCase().includes(s))
    );
  }

  return NextResponse.json({
    success: true,
    count: list.length,
    data: list,
    products: list,
  });
}
