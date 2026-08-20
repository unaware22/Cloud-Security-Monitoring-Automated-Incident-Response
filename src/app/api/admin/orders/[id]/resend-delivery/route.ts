import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/auth';
import { getClientIp } from '@/lib/security';
import { sendDigitalDelivery } from '@/lib/email';

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

  try {
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: {
        orderItems: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Not Found', message: 'Order not found' }, { status: 404 });
    }

    if (order.paymentStatus !== 'paid' && order.paymentStatus !== 'paid_manual') {
      return NextResponse.json(
        {
          error: 'Payment Incomplete',
          message: 'Cannot resend delivery for unpaid orders',
        },
        { status: 400 }
      );
    }

    const mainItem = order.orderItems[0];
    const deliveryContent =
      mainItem?.product?.deliveryContent || 'Digital item credentials';

    const deliveryResult = await sendDigitalDelivery({
      orderId: order.id,
      recipientEmail: order.customerEmail,
      orderCode: order.orderCode,
      productName: mainItem?.productNameSnapshot || 'Digital Item',
      deliveryContent,
    });

    // Write Audit Log
    await prisma.auditLog.create({
      data: {
        adminId: session.userId,
        action: 'DELIVERY_RESEND',
        entityType: 'orders',
        entityId: order.id,
        newValue: JSON.stringify({
          recipient: order.customerEmail,
          status: deliveryResult.success ? 'success' : 'failed',
        }),
        ipAddress: ip,
        userAgent,
      },
    });

    return NextResponse.json({
      success: deliveryResult.success,
      message: deliveryResult.success
        ? 'Digital delivery resent successfully'
        : 'Failed to resend digital delivery',
      error: deliveryResult.error,
    });
  } catch (error) {
    console.error('Error resending delivery:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
