import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getClientIp, recordSecurityEvent } from '@/lib/security';
import { verifyXenditWebhookToken } from '@/lib/xendit';
import { checkRateLimit, RATE_LIMIT_RULES } from '@/lib/rate-limiter';
import { sendDigitalDelivery } from '@/lib/email';
import { isDatabaseOnline, inMemoryOrders } from '@/lib/db-store';
import { decrementProductStock, dispatchProductDelivery } from '@/lib/products-store';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'Unknown';
  const requestId = req.headers.get('x-request-id') || `req-${Date.now()}`;
  const callbackToken = req.headers.get('x-callback-token');

  // 1. Rate Limit Check
  const rateLimitResult = await checkRateLimit(ip, RATE_LIMIT_RULES.WEBHOOK, {
    endpoint: '/api/payments/xendit/webhook',
    method: 'POST',
    userAgent,
    requestId,
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429 }
    );
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Bad Request', message: 'Invalid JSON' },
      { status: 400 }
    );
  }

  // 2. Token / Signature Verification
  const isTokenValid = verifyXenditWebhookToken(callbackToken);

  if (!isTokenValid) {
    // Record High-Severity Security Event
    await recordSecurityEvent({
      eventType: 'invalid_payment_callback',
      severity: 'high',
      ipAddress: ip,
      method: 'POST',
      endpoint: '/api/payments/xendit/webhook',
      userAgent,
      payloadSnippet: JSON.stringify(payload).substring(0, 300),
      statusCode: 401,
      description: 'Webhook received with missing, invalid, or forged callback token',
      requestId,
    });

    return NextResponse.json(
      {
        error: 'Unauthorized',
        message: 'Invalid or forged callback token',
      },
      { status: 401 }
    );
  }

  // 3. Process Webhook
  try {
    const externalId = payload.external_id || payload.id;
    const status = (payload.status || '').toUpperCase();

    if (!externalId) {
      return NextResponse.json(
        { error: 'Unprocessable Entity', message: 'Missing external_id' },
        { status: 422 }
      );
    }

    const dbOnline = await isDatabaseOnline();

    if (dbOnline) {
      const order = await prisma.order.findUnique({
        where: { orderCode: externalId },
        include: {
          orderItems: {
            include: {
              product: true,
            },
          },
        },
      });

      if (order) {
        // 4. Idempotency Check: Already processed
        if (order.paymentStatus === 'paid') {
          return NextResponse.json({
            success: true,
            message: 'Webhook already processed for this order (Idempotent)',
          });
        }

        if (status === 'PAID' || status === 'SETTLED') {
          const now = new Date();
          // Update Order Status
          await prisma.order.update({
            where: { id: order.id },
            data: {
              paymentStatus: 'paid',
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

          let deliveryContent = '';
          let remainingContent = '';

          if (rawLines.length > 0) {
            deliveryContent = rawLines.slice(0, qty).join('\n');
            remainingContent = rawLines.slice(qty).join('\n');
          } else {
            deliveryContent =
              mainItem?.product?.deliveryContent ||
              'Akun telah aktif. Silakan hubungi CS jika ada kendala.';
          }

          if (mainItem?.productId) {
            await prisma.product
              .update({
                where: { id: mainItem.productId },
                data: {
                  stock: { decrement: qty },
                  deliveryContent: remainingContent,
                },
              })
              .catch(() => {});
          }

          // Update or record PaymentTransaction
          await prisma.paymentTransaction.updateMany({
            where: { orderId: order.id },
            data: {
              status: 'paid',
              providerPaymentId: payload.payment_id || payload.id || null,
              rawPayload: JSON.stringify(payload),
            },
          });

          // Dispatch Digital Delivery
          await prisma.digitalDelivery.create({
            data: {
              orderId: order.id,
              deliveryEmail: order.customerEmail,
              deliveryStatus: 'delivered',
              deliveryData: deliveryContent,
              deliveredAt: now,
            },
          }).catch(() => {});

          try {
            await sendDigitalDelivery({
              orderId: order.id,
              recipientEmail: order.customerEmail,
              orderCode: order.orderCode,
              productName: mainItem?.productNameSnapshot || 'Akun Game',
              deliveryContent,
            });
          } catch {}

          return NextResponse.json({
            success: true,
            message: 'Payment received and order delivered successfully',
            order_code: order.orderCode,
          });
        } else if (status === 'EXPIRED') {
          await prisma.order.update({
            where: { id: order.id },
            data: {
              paymentStatus: 'expired',
              orderStatus: 'expired',
            },
          });

          return NextResponse.json({
            success: true,
            message: 'Order status updated to expired',
          });
        }
      }
    }

    // In-Memory Fallback
    const memoryOrder = inMemoryOrders.find((o) => o.orderCode === externalId);
    if (memoryOrder) {
      if (status === 'PAID' || status === 'SETTLED') {
        memoryOrder.paymentStatus = 'paid';
        memoryOrder.orderStatus = 'completed';
        memoryOrder.deliveryStatus = 'delivered';
        memoryOrder.paidAt = new Date().toISOString();

        const prodId =
          memoryOrder.productId ||
          (memoryOrder as any).product_id ||
          memoryOrder.orderItems?.[0]?.productId;
        const qty = memoryOrder.quantity || memoryOrder.orderItems?.[0]?.quantity || 1;

        if (prodId) {
          const dispatchRes = dispatchProductDelivery(prodId, qty);
          if (dispatchRes?.dispatchedContent) {
            memoryOrder.deliveryContent = dispatchRes.dispatchedContent;
            memoryOrder.delivery_content = dispatchRes.dispatchedContent;
            memoryOrder.digital_delivery = { content: dispatchRes.dispatchedContent };
          } else {
            decrementProductStock(prodId, qty);
          }
        }
      } else if (status === 'EXPIRED') {
        memoryOrder.paymentStatus = 'expired';
        memoryOrder.orderStatus = 'expired';
      }

      return NextResponse.json({
        success: true,
        message: `Webhook received with status ${status} (in-memory)`,
      });
    }

    return NextResponse.json({
      success: true,
      message: `Webhook received with status ${status}`,
    });
  } catch (error) {
    console.error('Error processing Xendit webhook:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
