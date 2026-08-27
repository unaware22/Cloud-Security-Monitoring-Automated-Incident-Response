import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/auth';
import { getClientIp } from '@/lib/security';
import { sendDigitalDelivery } from '@/lib/email';
import { isDatabaseOnline, inMemoryOrders } from '@/lib/db-store';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized', message: 'Admin session expired or invalid' }, { status: 401 });
  }

  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'Unknown';
  const cleanId = decodeURIComponent(params.id || '').trim();

  const dbOnline = await isDatabaseOnline();

  if (dbOnline) {
    try {
      const order = await prisma.order.findFirst({
        where: {
          OR: [
            { id: cleanId },
            { orderCode: cleanId },
            { orderCode: cleanId.toUpperCase() },
          ],
        },
        include: {
          orderItems: {
            include: {
              product: true,
            },
          },
          digitalDeliveries: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (order) {
        if (order.paymentStatus !== 'paid' && order.paymentStatus !== 'paid_manual') {
          return NextResponse.json(
            {
              error: 'Payment Incomplete',
              message: 'Tidak dapat mengirim ulang produk untuk pesanan yang belum lunas',
            },
            { status: 400 }
          );
        }

        let validAdminId: string | null = null;
        try {
          const matchedAdmin = await prisma.adminUser.findFirst({
            where: {
              OR: [
                { id: session.userId },
                { email: session.email?.toLowerCase() },
              ],
            },
          });
          if (matchedAdmin) {
            validAdminId = matchedAdmin.id;
          } else {
            const anyAdmin = await prisma.adminUser.findFirst();
            validAdminId = anyAdmin?.id || null;
          }
        } catch {
          validAdminId = null;
        }

        const mainItem = order.orderItems[0];
        const deliveryContent =
          order.digitalDeliveries?.[0]?.deliveryData ||
          mainItem?.product?.deliveryContent ||
          'Detail kredensial akun digital SALADINSHOP';

        const deliveryResult = await sendDigitalDelivery({
          orderId: order.id,
          recipientEmail: order.customerEmail,
          orderCode: order.orderCode,
          productName: mainItem?.productNameSnapshot || 'Digital Item SALADINSHOP',
          deliveryContent,
        });

        // Write Audit Log safely
        await prisma.auditLog
          .create({
            data: {
              adminId: validAdminId,
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
          })
          .catch(() => {});

        return NextResponse.json({
          success: deliveryResult.success,
          message: deliveryResult.success
            ? 'Email detail produk berhasil dikirimkan ulang ke pelanggan!'
            : 'Gagal mengirim ulang email kredensial produk',
          error: deliveryResult.error,
        });
      }
    } catch (error) {
      console.error('Error resending delivery in DB:', error);
    }
  }

  // Memory store fallback
  const memOrder = inMemoryOrders.find(
    (o) =>
      o.id === cleanId ||
      o.orderCode.toUpperCase() === cleanId.toUpperCase() ||
      o.orderCode.toLowerCase() === cleanId.toLowerCase()
  );

  if (!memOrder) {
    return NextResponse.json({ error: 'Not Found', message: `Pesanan (${cleanId}) tidak ditemukan` }, { status: 404 });
  }

  if (memOrder.paymentStatus !== 'paid' && memOrder.paymentStatus !== 'paid_manual') {
    return NextResponse.json(
      {
        error: 'Payment Incomplete',
        message: 'Tidak dapat mengirim ulang produk untuk pesanan yang belum lunas',
      },
      { status: 400 }
    );
  }

  const deliveryContent =
    memOrder.deliveryContent ||
    memOrder.delivery_content ||
    memOrder.digital_delivery?.content ||
    'Detail kredensial akun digital SALADINSHOP';

  const deliveryResult = await sendDigitalDelivery({
    orderId: memOrder.id,
    recipientEmail: memOrder.customerEmail,
    orderCode: memOrder.orderCode,
    productName: memOrder.orderItems?.[0]?.productNameSnapshot || 'Digital Item SALADINSHOP',
    deliveryContent,
  });

  return NextResponse.json({
    success: deliveryResult.success,
    message: deliveryResult.success
      ? 'Email detail produk berhasil dikirimkan ulang ke pelanggan!'
      : 'Gagal mengirim ulang email kredensial produk',
  });
}
