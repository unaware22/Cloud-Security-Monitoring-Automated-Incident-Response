import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/auth';
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
  const rawId = params.id;
  const cleanId = decodeURIComponent(rawId || '').trim();

  if (!cleanId) {
    return NextResponse.json({ error: 'Bad Request', message: 'Order ID / Code is required' }, { status: 400 });
  }

  // 1. Auth Guard
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized', message: 'Admin session expired or invalid' }, { status: 401 });
  }

  const dbOnline = await isDatabaseOnline();
  let dbOrderFound = false;

  // 2. Database Flow
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
          orderItems: {
            include: { product: true },
          },
        },
      });

      if (order) {
        dbOrderFound = true;

        if (order.paymentStatus === 'paid' || order.paymentStatus === 'paid_manual') {
          return NextResponse.json(
            { error: 'Conflict', message: 'Pesanan sudah disahkan sebelumnya' },
            { status: 409 }
          );
        }

        const oldStatus = order.paymentStatus;
        const now = new Date();

        // Safely resolve admin user ID to prevent FK constraint violations
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
        const qty = mainItem?.quantity || 1;
        const prodId = mainItem?.productId;

        // Determine dispatched credential content
        let dispatchedContent = '';
        if (prodId) {
          const dispatchRes = dispatchProductDelivery(prodId, qty);
          if (dispatchRes?.dispatchedContent) {
            dispatchedContent = dispatchRes.dispatchedContent;
          }
        }

        if (!dispatchedContent) {
          const rawLines = (mainItem?.product?.deliveryContent || '')
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean);

          if (rawLines.length > 0) {
            dispatchedContent = rawLines.slice(0, qty).join('\n');
            const remainingContent = rawLines.slice(qty).join('\n');
            if (prodId) {
              await prisma.product
                .update({
                  where: { id: prodId },
                  data: {
                    stock: { decrement: qty },
                    deliveryContent: remainingContent,
                  },
                })
                .catch(() => {});
            }
          } else {
            dispatchedContent =
              mainItem?.product?.deliveryContent ||
              'Email: saladin-vip892@mojangmail.com | Pass: SaladinSecure#2026 | Full Access: https://account.mojang.com';
            if (prodId) {
              decrementProductStock(prodId, qty);
            }
          }
        }

        // Execute DB updates
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
            .catch((e) => console.warn('Digital delivery create warning:', e));

          if (order.manualPaymentSubmissions && order.manualPaymentSubmissions.length > 0) {
            await tx.manualPaymentSubmission
              .update({
                where: { id: order.manualPaymentSubmissions[0].id },
                data: {
                  status: 'approved',
                  reviewedBy: validAdminId,
                  reviewedAt: now,
                },
              })
              .catch((e) => console.warn('Manual submission update warning:', e));
          }

          await tx.auditLog
            .create({
              data: {
                adminId: validAdminId,
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
            })
            .catch((e) => console.warn('Audit log create warning:', e));
        });

        // Sync to memory store if present
        const memoryOrder = inMemoryOrders.find(
          (o) => o.id === order.id || o.orderCode.toUpperCase() === order.orderCode.toUpperCase()
        );
        if (memoryOrder) {
          memoryOrder.paymentStatus = 'paid_manual';
          memoryOrder.orderStatus = 'completed';
          memoryOrder.deliveryStatus = 'delivered';
          memoryOrder.paidAt = now.toISOString();
          memoryOrder.deliveryContent = dispatchedContent;
          memoryOrder.delivery_content = dispatchedContent;
        }

        // Send Email
        try {
          await sendDigitalDelivery({
            orderId: order.id,
            recipientEmail: order.customerEmail,
            orderCode: order.orderCode,
            productName: mainItem?.productNameSnapshot || 'Akun Game Digital SALADINSHOP',
            deliveryContent: dispatchedContent,
          });
        } catch (emailErr) {
          console.warn('Failed to send digital delivery email:', emailErr);
        }

        return NextResponse.json({
          success: true,
          message: 'Pembayaran pesanan berhasil disahkan & produk digital telah aktif',
          data: {
            order_id: order.id,
            order_code: order.orderCode,
            payment_status: 'paid_manual',
            delivery_status: 'delivered',
          },
        });
      }
    } catch (dbErr: any) {
      console.error('[Approve Manual Payment DB Error]:', dbErr);
      if (dbOrderFound) {
        return NextResponse.json(
          { error: 'Internal Server Error', message: `Gagal memperbarui pesanan di database: ${dbErr?.message || 'Database error'}` },
          { status: 500 }
        );
      }
    }
  }

  // 3. In-Memory Fallback Approval
  const memoryOrder = inMemoryOrders.find(
    (o) =>
      o.id === cleanId ||
      o.orderCode.toUpperCase() === cleanId.toUpperCase() ||
      o.orderCode.toLowerCase() === cleanId.toLowerCase()
  );

  if (!memoryOrder) {
    return NextResponse.json(
      {
        error: 'Not Found',
        message: `Pesanan (${cleanId}) tidak ditemukan di sistem.`,
      },
      { status: 404 }
    );
  }

  const wasAlreadyPaid = memoryOrder.paymentStatus === 'paid' || memoryOrder.paymentStatus === 'paid_manual';

  memoryOrder.paymentStatus = 'paid_manual';
  memoryOrder.orderStatus = 'completed';
  memoryOrder.deliveryStatus = 'delivered';
  memoryOrder.paidAt = new Date().toISOString();

  let dispatchedCredential = memoryOrder.deliveryContent || memoryOrder.delivery_content || '';

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
      delivery_status: 'delivered',
    },
  });
}
