import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken, COOKIE_NAME } from '@/lib/auth';
import { getClientIp } from '@/lib/security';
import { sendDigitalDelivery } from '@/lib/email';
import { isDatabaseOnline, inMemoryOrders, inMemoryAudits } from '@/lib/db-store';
import { decrementProductStock, dispatchProductDelivery } from '@/lib/products-store';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'Unknown';
  const orderId = params.id;

  // 1. Auth Guard
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized', message: 'Admin login required' }, { status: 401 });
  }

  const session = await verifyAdminToken(token);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized', message: 'Invalid or expired session' }, { status: 401 });
  }

  const dbOnline = await isDatabaseOnline();

  // Database Flow
  if (dbOnline) {
    try {
      const order = await prisma.order.findFirst({
        where: {
          OR: [{ id: orderId }, { orderCode: orderId.toUpperCase() }],
        },
        include: {
          manualPaymentSubmissions: {
            where: { status: 'pending' },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          orderItems: {
            include: { product: true },
          },
        },
      });

      if (order) {
        if (order.paymentStatus === 'paid' || order.paymentStatus === 'paid_manual') {
          return NextResponse.json(
            { error: 'Conflict', message: 'Pesanan sudah disahkan sebelumnya' },
            { status: 409 }
          );
        }

        const oldStatus = order.paymentStatus;
        const now = new Date();

        await prisma.$transaction(async (tx) => {
          await tx.order.update({
            where: { id: order.id },
            data: {
              paymentStatus: 'paid_manual',
              orderStatus: 'completed',
              deliveryStatus: 'delivered',
              paidAt: now,
            },
          });

          const mainItem = order.orderItems[0];
          const qty = mainItem?.quantity || 1;
          const rawLines = (mainItem?.product?.deliveryContent || '')
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean);

          let dispatchedContent = '';
          let remainingContent = '';

          if (rawLines.length > 0) {
            dispatchedContent = rawLines.slice(0, qty).join('\n');
            remainingContent = rawLines.slice(qty).join('\n');
          } else {
            dispatchedContent =
              mainItem?.product?.deliveryContent ||
              'Email: saladin-vip892@mojangmail.com | Pass: SaladinSecure#2026 | Full Access: https://account.mojang.com';
          }

          if (mainItem?.productId) {
            await tx.product
              .update({
                where: { id: mainItem.productId },
                data: {
                  stock: { decrement: qty },
                  deliveryContent: remainingContent,
                },
              })
              .catch(() => {});
          }

          await tx.digitalDelivery
            .create({
              data: {
                orderId: order.id,
                deliveryEmail: order.customerEmail,
                deliveryStatus: 'delivered',
                deliveryData: dispatchedContent,
                deliveredAt: now,
              },
            })
            .catch(() => {});

          if (order.manualPaymentSubmissions.length > 0) {
            await tx.manualPaymentSubmission.update({
              where: { id: order.manualPaymentSubmissions[0].id },
              data: {
                status: 'approved',
                reviewedBy: session.userId,
                reviewedAt: now,
              },
            });
          }

          await tx.auditLog.create({
            data: {
              adminId: session.userId,
              action: 'MANUAL_PAYMENT_APPROVE',
              entityType: 'orders',
              entityId: order.id,
              oldValue: JSON.stringify({
                payment_status: oldStatus,
                order_status: order.orderStatus,
              }),
              newValue: JSON.stringify({
                payment_status: 'paid_manual',
                order_status: 'completed',
                approved_by: session.email,
              }),
              ipAddress: ip,
              userAgent,
            },
          });
        });

        const mainItem = order.orderItems[0];
        const qty = mainItem?.quantity || 1;
        const rawLines = (mainItem?.product?.deliveryContent || '')
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        const finalContent =
          rawLines.length > 0
            ? rawLines.slice(0, qty).join('\n')
            : mainItem?.product?.deliveryContent ||
              'Email: saladin-vip892@mojangmail.com | Pass: SaladinSecure#2026';

        try {
          await sendDigitalDelivery({
            orderId: order.id,
            recipientEmail: order.customerEmail,
            orderCode: order.orderCode,
            productName: mainItem?.productNameSnapshot || 'Akun Minecraft Java & Bedrock Edition',
            deliveryContent: finalContent,
          });
        } catch {}

        return NextResponse.json({
          success: true,
          message: 'Pembayaran pesanan berhasil disahkan & produk digital telah aktif',
          data: {
            order_id: order.id,
            order_code: order.orderCode,
            payment_status: 'paid_manual',
          },
        });
      }
    } catch {
      // Fallback below
    }
  }

  // In-Memory Approval
  const memoryOrder = inMemoryOrders.find(
    (o) => o.id === orderId || o.orderCode.toUpperCase() === orderId.toUpperCase()
  );

  if (!memoryOrder) {
    return NextResponse.json({ error: 'Not Found', message: 'Order not found' }, { status: 404 });
  }

  const wasAlreadyPaid = memoryOrder.paymentStatus === 'paid' || memoryOrder.paymentStatus === 'paid_manual';

  memoryOrder.paymentStatus = 'paid_manual';
  memoryOrder.orderStatus = 'completed';
  memoryOrder.deliveryStatus = 'delivered';
  memoryOrder.paidAt = new Date().toISOString();

  let dispatchedCredential = memoryOrder.deliveryContent || memoryOrder.delivery_content || '';

  // Deduct stock and dispatch unique credential on approval only once (if not already paid)
  if (!wasAlreadyPaid) {
    const prodId =
      memoryOrder.productId ||
      (memoryOrder as any).product_id ||
      memoryOrder.orderItems?.[0]?.productId ||
      memoryOrder.items?.[0]?.product_id;
    const qty = memoryOrder.quantity || memoryOrder.orderItems?.[0]?.quantity || 1;

    if (prodId) {
      const dispatchRes = dispatchProductDelivery(prodId, qty);
      if (dispatchRes?.dispatchedContent) {
        dispatchedCredential = dispatchRes.dispatchedContent;
      } else {
        decrementProductStock(prodId, qty);
      }
    }
  }

  if (dispatchedCredential) {
    memoryOrder.deliveryContent = dispatchedCredential;
    memoryOrder.delivery_content = dispatchedCredential;
    memoryOrder.digital_delivery = { content: dispatchedCredential };
  }

  inMemoryAudits.unshift({
    id: `audit-${Date.now()}`,
    action: 'MANUAL_PAYMENT_APPROVE',
    admin: { email: session.email },
    entityType: 'orders',
    ipAddress: ip,
    createdAt: new Date().toISOString(),
    newValue: JSON.stringify({
      order_code: memoryOrder.orderCode,
      status: 'paid_manual',
      approved_by: session.email,
    }),
  });

  return NextResponse.json({
    success: true,
    message: 'Pembayaran pesanan berhasil disahkan & produk digital telah aktif',
    data: {
      order_id: memoryOrder.id,
      order_code: memoryOrder.orderCode,
      payment_status: 'paid_manual',
    },
  });
}
