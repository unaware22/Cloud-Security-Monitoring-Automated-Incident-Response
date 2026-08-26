import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getClientIp, detectSQLi, recordSecurityEvent } from '@/lib/security';
import { fallbackStore } from '@/lib/products-store';
import { isDatabaseOnline } from '@/lib/db-store';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const ip = getClientIp(req.headers);
  const requestId = req.headers.get('x-request-id') || `req-${Date.now()}`;
  const slug = params.slug;

  if (detectSQLi(slug)) {
    await recordSecurityEvent({
      eventType: 'sql_injection_attempt',
      severity: 'high',
      ipAddress: ip,
      method: 'GET',
      endpoint: req.nextUrl.pathname,
      userAgent: req.headers.get('user-agent') || 'Unknown',
      payloadSnippet: `slug=${slug}`,
      statusCode: 400,
      description: 'SQL injection attempt in product slug',
      requestId,
    });

    return NextResponse.json(
      { error: 'Bad Request', message: 'Invalid product slug' },
      { status: 400 }
    );
  }

  // Check DB online
  const dbOnline = await isDatabaseOnline();
  let product: any = null;

  if (dbOnline) {
    try {
      product = await prisma.product.findUnique({
        where: { slug },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          price: true,
          stock: true,
          productType: true,
          imageUrl: true,
          game: true,
          subCategory1: true,
          subCategory2: true,
          deliveryType: true,
          sortOrder: true,
          serviceTag: true,
          soldCount: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch {
      product = null;
    }
  }

  // Instant In-Memory Fallback if DB offline or record not found in DB
  if (!product) {
    product = fallbackStore.getProductBySlug(slug) || fallbackStore.getProductById(slug);
  }

  if (!product || !product.isActive) {
    return NextResponse.json(
      { error: 'Not Found', message: 'Product not found or unavailable' },
      { status: 404 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      data: product,
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
      },
    }
  );
}
