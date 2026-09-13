import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/auth';
import { getClientIp } from '@/lib/security';
import { isDatabaseOnline, inMemoryOrders, inMemoryAudits } from '@/lib/db-store';
import { canReviewPendingOrder } from '@/lib/order-review';
import { cancelMidtransTransaction, checkMidtransTransactionStatus } from '@/lib/midtrans';

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
  const body = await req.json().catch(() => ({}));
  const suppliedReason = String(body.reason || '').trim().slice(0, 500);
  const reason = suppliedReason || 'Pesanan ditolak oleh administrator';
  const cleanId = decodeURIComponent(params.id || '').trim();

  if (!cleanId) {
    return NextResponse.json({ error: 'Bad Request', message: 'Order ID / Code is required' }, { status: 400 });
  }

  const dbOnline = await isDatabaseOnline();
  let dbOrderFound = false;

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
          manualPaymentSubmissions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (order) {
        dbOrderFound = true;
        if (!canReviewPendingOrder(order)) {
          return NextResponse.json(
            {
              error: 'Conflict',
              message: 'Pesanan tidak dapat ditolak karena sudah dibayar, dibatalkan, ditolak, atau diproses.',
            },
            { status: 409 }
          );
        }

        const providerStatus = await checkMidtransTransactionStatus(order.orderCode);
        const providerPaymentReceived =
          providerStatus?.transaction_status === 'settlement' ||
          (providerStatus?.transaction_status === 'capture' && providerStatus?.fraud_status === 'accept');

        if (providerPaymentReceived) {
          return NextResponse.json(
            {
              error: 'Conflict',
              message: 'Pembayaran sudah diterima Midtrans. Pesanan tidak boleh ditolak; periksa proses refund.',
            },
            { status: 409 }
          );
        }

        const providerAlreadyFinal = ['cancel', 'expire', 'deny'].includes(
          providerStatus?.transaction_status || ''
        );
        if (!providerAlreadyFinal) {
          try {
            const providerCancellation = await cancelMidtransTransaction(order.orderCode);
            if (!providerCancellation.cancelled && !providerCancellation.notFound) {
              return NextResponse.json(
                {
                  error: 'Bad Gateway',
                  message: 'Midtrans belum mengonfirmasi pembatalan. Pesanan belum diubah agar status tetap konsisten.',
                },
                { status: providerCancellation.statusCode === 412 ? 409 : 502 }
              );
            }
          } catch (error) {
            console.error('Midtrans admin rejection cancellation error:', error);
            return NextResponse.json(
              {
                error: 'Bad Gateway',
                message: 'Status pembatalan belum dapat dipastikan dari Midtrans. Pesanan belum diubah.',
              },
              { status: 502 }
            );
          }
        }

        const oldStatus = order.paymentStatus;
        const now = new Date();

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

        await prisma.$transaction(async (tx) => {
          await tx.order.update({
            where: { id: order.id },
            data: {
              paymentStatus: 'rejected',
              orderStatus: 'cancelled',
              deliveryStatus: 'cancelled',
            },
          });

          await tx.paymentTransaction
            .updateMany({
              where: { orderId: order.id },
              data: { status: 'rejected' },
            })
            .catch(() => {});

          if (order.manualPaymentSubmissions && order.manualPaymentSubmissions.length > 0) {
            await tx.manualPaymentSubmission
              .update({
                where: { id: order.manualPaymentSubmissions[0].id },
                data: {
                  status: 'rejected',
                  reviewedBy: validAdminId,
                  reviewedAt: now,
                  note: `${order.manualPaymentSubmissions[0].note || ''} [Ditolak: ${reason}]`,
                },
              })
              .catch(() => {});
          }

          await tx.auditLog
            .create({
              data: {
                adminId: validAdminId,
                action: 'MANUAL_PAYMENT_REJECT',
                entityType: 'orders',
                entityId: order.id,
                oldValue: JSON.stringify({ payment_status: oldStatus }),
                newValue: JSON.stringify({ payment_status: 'rejected', reason }),
                ipAddress: ip,
                userAgent,
              },
            })
            .catch(() => {});
        });

        // Sync memory store
        const memOrder = inMemoryOrders.find(
          (o) => o.id === order.id || o.orderCode.toUpperCase() === order.orderCode.toUpperCase()
        );
        if (memOrder) {
          memOrder.paymentStatus = 'rejected';
          memOrder.orderStatus = 'cancelled';
          memOrder.deliveryStatus = 'cancelled';
        }

        return NextResponse.json({
          success: true,
          message: 'Pembayaran pesanan manual berhasil ditolak',
          data: {
            order_id: order.id,
            order_code: order.orderCode,
            payment_status: 'rejected',
          },
        });
      }
    } catch (error) {
      console.error('Error rejecting manual payment:', error);
      if (dbOrderFound) {
        return NextResponse.json(
          { error: 'Internal Server Error', message: 'Gagal memperbarui status pesanan di database.' },
          { status: 500 }
        );
      }
    }
  }

  // Memory Fallback
  const memOrder = inMemoryOrders.find(
    (o) =>
      o.id === cleanId ||
      o.orderCode.toUpperCase() === cleanId.toUpperCase() ||
      o.orderCode.toLowerCase() === cleanId.toLowerCase()
  );

  if (!memOrder) {
    return NextResponse.json({ error: 'Not Found', message: `Pesanan (${cleanId}) tidak ditemukan` }, { status: 404 });
  }

  if (!canReviewPendingOrder(memOrder)) {
    return NextResponse.json(
      {
        error: 'Conflict',
        message: 'Pesanan tidak dapat ditolak karena sudah dibayar, dibatalkan, ditolak, atau diproses.',
      },
      { status: 409 }
    );
  }

  memOrder.paymentStatus = 'rejected';
  memOrder.orderStatus = 'cancelled';
  memOrder.deliveryStatus = 'cancelled';

  inMemoryAudits.unshift({
    id: `audit-${Date.now()}`,
    action: 'MANUAL_PAYMENT_REJECT',
    admin: { email: session.email },
    entityType: 'orders',
    ipAddress: ip,
    createdAt: new Date().toISOString(),
    newValue: JSON.stringify({ order_code: memOrder.orderCode, status: 'rejected', reason }),
  });

  return NextResponse.json({
    success: true,
    message: 'Pembayaran pesanan manual berhasil ditolak',
    data: {
      order_id: memOrder.id,
      order_code: memOrder.orderCode,
      payment_status: 'rejected',
    },
  });
}
