import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/auth';
import { getClientIp } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'Unknown';
  const body = await req.json().catch(() => ({}));
  const reason = body.reason || 'Payment proof verification failed';

  try {
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: {
        manualPaymentSubmissions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Not Found', message: 'Order not found' }, { status: 404 });
    }

    const oldStatus = order.paymentStatus;
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: 'rejected',
          orderStatus: 'cancelled',
        },
      });

      if (order.manualPaymentSubmissions.length > 0) {
        await tx.manualPaymentSubmission.update({
          where: { id: order.manualPaymentSubmissions[0].id },
          data: {
            status: 'rejected',
            reviewedBy: session.userId,
            reviewedAt: now,
            note: `${order.manualPaymentSubmissions[0].note || ''} [Rejected: ${reason}]`,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          adminId: session.userId,
          action: 'MANUAL_PAYMENT_REJECT',
          entityType: 'orders',
          entityId: order.id,
          oldValue: JSON.stringify({ payment_status: oldStatus }),
          newValue: JSON.stringify({ payment_status: 'rejected', reason }),
          ipAddress: ip,
          userAgent,
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: 'Manual payment rejected',
      data: {
        order_id: order.id,
        order_code: order.orderCode,
        payment_status: 'rejected',
      },
    });
  } catch (error) {
    console.error('Error rejecting manual payment:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
