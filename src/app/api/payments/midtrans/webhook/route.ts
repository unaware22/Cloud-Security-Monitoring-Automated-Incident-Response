import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyMidtransSignature } from '@/lib/midtrans';
import { isDatabaseOnline, inMemoryOrders } from '@/lib/db-store';
import { decrementProductStock, dispatchProductDelivery } from '@/lib/products-store';
import { sendDigitalDelivery, sendCustomSkinProcessingEmail } from '@/lib/email';
import { getClientIp, recordSecurityEvent } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const requestId = req.headers.get('x-request-id') || `req-${Date.now()}`;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad Request', message: 'Malformed JSON payload' }, { status: 400 });
  }

  const {
    order_id,
    status_code,
    gross_amount,
    signature_key,
    transaction_status,
    fraud_status,
    payment_type,
  } = body;

  if (!order_id || !status_code || !gross_amount || !signature_key) {
    return NextResponse.json({ error: 'Bad Request', message: 'Missing required Midtrans webhook parameters' }, { status: 400 });
  }

  // 1. Verify SHA-512 Signature Key
  const isValidSignature = verifyMidtransSignature({
    orderId: order_id,
    statusCode: status_code,
    grossAmount: gross_amount,
    signatureKey: signature_key,
  });

  if (!isValidSignature) {
    console.warn(`[Midtrans Webhook] Invalid signature from IP ${ip} for order ${order_id}`);
    await recordSecurityEvent({
      eventType: 'invalid_payment_callback',
      severity: 'high',
      ipAddress: ip,
      method: 'POST',
      endpoint: '/api/payments/midtrans/webhook',
      userAgent: req.headers.get('user-agent') || 'Unknown',
      payloadSnippet: `order_id=${order_id}&signature=${signature_key}`,
      statusCode: 403,
      description: 'Midtrans Webhook SHA-512 Signature Mismatch',
      requestId,
    });

    return NextResponse.json({ error: 'Forbidden', message: 'Invalid signature key' }, { status: 403 });
  }

  console.log(`[Midtrans Webhook Received] Order: ${order_id} | Status: ${transaction_status} | Fraud: ${fraud_status} | Type: ${payment_type}`);

  // 2. Determine Paid Condition
  const isPaid =
    transaction_status === 'settlement' ||
    (transaction_status === 'capture' && fraud_status === 'accept');

  const isFailed =
    transaction_status === 'deny' ||
    transaction_status === 'cancel' ||
    transaction_status === 'expire';

  const now = new Date();
  const dbOnline = await isDatabaseOnline();

  // 3. Process Paid Order in Database
  if (dbOnline) {
    try {
      const order = await prisma.order.findUnique({
        where: { orderCode: order_id },
        include: {
          orderItems: { include: { product: true } },
          paymentTransactions: true,
        },
      });

      if (order) {
        if (isPaid && order.paymentStatus !== 'paid') {
          const mainItem = order.orderItems[0];
          const product = mainItem?.product;
          const isManual =
            product?.deliveryType === 'manual' ||
            product?.serviceTag === 'pembuatan-cepat' ||
            product?.subCategory1 === 'skins' ||
            product?.slug?.includes('skin');

          let txPayload: any = {};
          try {
            if (order.paymentTransactions[0]?.rawPayload) {
              txPayload = JSON.parse(order.paymentTransactions[0].rawPayload);
            }
          } catch {}

          if (isManual) {
            // Set processing for manual craft
            await prisma.order.update({
              where: { id: order.id },
              data: {
                paymentStatus: 'paid',
                orderStatus: 'processing',
                deliveryStatus: 'processing',
                paidAt: now,
              },
            });

            await prisma.paymentTransaction.updateMany({
              where: { orderId: order.id },
              data: { status: 'paid' },
            }).catch(() => {});

            // Send custom skin craft notification
            try {
              await sendCustomSkinProcessingEmail({
                recipientEmail: order.customerEmail,
                orderCode: order.orderCode,
                productName: mainItem?.productNameSnapshot || 'Custom Skin Minecraft',
                customerName: order.customerName,
                customerPhone: order.customerPhone || undefined,
                skinDetails: txPayload.custom_skin_details,
              });
            } catch {}
          } else {
            // Instant digital delivery
            await prisma.order.update({
              where: { id: order.id },
              data: {
                paymentStatus: 'paid',
                orderStatus: 'completed',
                deliveryStatus: 'delivered',
                paidAt: now,
              },
            });

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
                'Akun telah aktif. Silakan cek detail di bawah atau hubungi CS kami.';
            }

            if (mainItem?.productId) {
              await prisma.product.update({
                where: { id: mainItem.productId },
                data: {
                  stock: { decrement: qty },
                  deliveryContent: remainingContent,
                },
              }).catch(() => {});
            }

            await prisma.paymentTransaction.updateMany({
              where: { orderId: order.id },
              data: { status: 'paid' },
            }).catch(() => {});

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
          }
        } else if (isFailed && order.paymentStatus === 'pending') {
          await prisma.order.update({
            where: { id: order.id },
            data: {
              paymentStatus: 'failed',
              orderStatus: 'cancelled',
            },
          });

          await prisma.paymentTransaction.updateMany({
            where: { orderId: order.id },
            data: { status: 'failed' },
          }).catch(() => {});
        }
      }
    } catch (dbErr) {
      console.error('[Midtrans Webhook DB Processing Error]:', dbErr);
    }
  }

  // 4. Update in-memory orders
  const memOrder = inMemoryOrders.find((o) => o.orderCode === order_id);
  if (memOrder) {
    if (isPaid && memOrder.paymentStatus !== 'paid') {
      const isManual =
        memOrder.deliveryType === 'manual' ||
        memOrder.customSkinDetails != null ||
        memOrder.orderItems?.[0]?.product?.deliveryType === 'manual';

      if (isManual) {
        memOrder.paymentStatus = 'paid';
        memOrder.orderStatus = 'processing';
        memOrder.deliveryStatus = 'processing';
        memOrder.paidAt = now.toISOString();

        try {
          await sendCustomSkinProcessingEmail({
            recipientEmail: memOrder.customerEmail,
            orderCode: memOrder.orderCode,
            productName: memOrder.orderItems?.[0]?.productNameSnapshot || 'Custom Skin Minecraft',
            customerName: memOrder.customerName,
            customerPhone: memOrder.customerPhone,
            skinDetails: memOrder.customSkinDetails || undefined,
          });
        } catch {}
      } else {
        memOrder.paymentStatus = 'paid';
        memOrder.orderStatus = 'completed';
        memOrder.deliveryStatus = 'delivered';
        memOrder.paidAt = now.toISOString();

        const prodId =
          memOrder.productId ||
          (memOrder as any).product_id ||
          memOrder.orderItems?.[0]?.productId;
        const qty = memOrder.quantity || memOrder.orderItems?.[0]?.quantity || 1;

        if (prodId) {
          const dispatchRes = dispatchProductDelivery(prodId, qty);
          if (dispatchRes?.dispatchedContent) {
            memOrder.deliveryContent = dispatchRes.dispatchedContent;
            memOrder.delivery_content = dispatchRes.dispatchedContent;
            memOrder.digital_delivery = { content: dispatchRes.dispatchedContent };
          } else {
            decrementProductStock(prodId, qty);
          }
        }
      }
    } else if (isFailed && memOrder.paymentStatus === 'pending') {
      memOrder.paymentStatus = 'failed';
      memOrder.orderStatus = 'cancelled';
    }
  }

  return NextResponse.json({ status: 'OK', message: 'Webhook processed successfully' });
}
