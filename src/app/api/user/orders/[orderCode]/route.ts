import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCustomerSession } from '@/lib/user-auth';
import { getClientIp, recordSecurityEvent } from '@/lib/security';

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

  const orderCode = decodeURIComponent(params.orderCode || '').trim().toUpperCase();
  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'Unknown';
  const requestId = req.headers.get('x-request-id') || `req-${Date.now()}`;

  try {
    const order = await prisma.order.findUnique({
      where: { orderCode },
      include: {
        orderItems: {
          include: {
            product: true,
          },
        },
        digitalDeliveries: true,
        voucherUsage: {
          include: {
            voucher: true,
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Pesanan tidak ditemukan.' },
        { status: 404 }
      );
    }

    // Ownership Verification
    const isOwner =
      order.userId === session.userId ||
      order.customerEmail.toLowerCase() === session.email.toLowerCase();

    if (!isOwner) {
      await recordSecurityEvent({
        eventType: 'unauthorized_order_access',
        severity: 'high',
        ipAddress: ip,
        method: 'GET',
        endpoint: `/api/user/orders/${orderCode}`,
        userAgent,
        payloadSnippet: `targetOrder=${orderCode}; sessionUserId=${session.userId}; sessionEmail=${session.email}`,
        statusCode: 403,
        description: 'Unauthorized attempt by authenticated customer to access another user order',
        requestId,
      });

      return NextResponse.json(
        { error: 'Forbidden', message: 'Anda tidak memiliki akses ke rincian pesanan ini.' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.error('Error fetching order detail:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Gagal mengambil detail pesanan.' },
      { status: 500 }
    );
  }
}
