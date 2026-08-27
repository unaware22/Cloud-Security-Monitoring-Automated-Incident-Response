import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/auth';
import { getClientIp } from '@/lib/security';
import { isDatabaseOnline, inMemoryOrders, inMemoryAudits } from '@/lib/db-store';

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
  const reason = body.reason || 'Bukti transfer tidak valid / mutasi rekening tidak ditemukan';
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
          manualPaymentSubmissions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (order) {
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
            },
          });

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

  memOrder.paymentStatus = 'rejected';
  memOrder.orderStatus = 'cancelled';

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
