import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCustomerSession } from '@/lib/user-auth';
import { getClientIp, recordSecurityEvent } from '@/lib/security';
import { customerOrderWhere, customerOrderSelect, customerOrderDetail, orderReference } from '@/lib/customer-order';
import { checkRateLimit, RATE_LIMIT_RULES } from '@/lib/rate-limiter';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { orderCode: string } }
) {
  const session = await getCustomerSession(req);
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Silakan login terlebih dahulu.' },
      { status: 401 }
    );
  }

  const orderCode = (params.orderCode || '').trim().toUpperCase();
  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'Unknown';
  const requestId = req.headers.get('x-request-id') || `req-${Date.now()}`;

  const rate = await checkRateLimit(ip, RATE_LIMIT_RULES.ORDER_DETAIL, {
    endpoint: '/api/user/orders/[orderCode]', method: 'GET', userAgent, requestId,
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
  }

  try {
    const order = orderCode.length <= 30 ? await prisma.order.findFirst({
      where: { orderCode, ...customerOrderWhere(session) },
      select: customerOrderSelect,
    }) : null;

    if (!order) {
      await recordSecurityEvent({
        eventType: 'unauthorized_object_access_attempt',
        severity: 'high', ipAddress: ip, method: 'GET',
        endpoint: '/api/user/orders/[orderCode]', userAgent,
        payloadSnippet: `order_ref=${orderReference(orderCode)}`,
        statusCode: 404,
        description: 'Customer order lookup denied: unknown order or ownership mismatch',
        requestId,
      });
      return NextResponse.json(
        { error: 'Not Found', message: 'Pesanan tidak ditemukan.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: customerOrderDetail(order),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Error fetching order detail:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Gagal mengambil detail pesanan.' },
      { status: 500 }
    );
  }
}
