import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isDatabaseOnline, inMemoryOrders } from '@/lib/db-store';
import { decrementProductStock, dispatchProductDelivery } from '@/lib/products-store';
import { sendDigitalDelivery, sendCustomSkinProcessingEmail } from '@/lib/email';
import { checkMidtransTransactionStatus } from '@/lib/midtrans';

export const dynamic = 'force-dynamic';

/**
 * POST /api/orders/verify-payment
 * Called after Midtrans / Xendit redirects user back. Checks status directly with API
 * and updates order + dispatches delivery if paid.
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 });
  }

  const orderCode = body.order_code;
  if (!orderCode) {
    return NextResponse.json({ error: 'Missing order_code' }, { status: 400 });
  }

  const dbOnline = await isDatabaseOnline();

  // 1. Try to verify with Midtrans API directly
  let paymentPaid = false;
  try {
    const midtransStatus = await checkMidtransTransactionStatus(orderCode);
    if (midtransStatus) {
      const ts = midtransStatus.transaction_status;
      const fs = midtransStatus.fraud_status;
      if (ts === 'settlement' || (ts === 'capture' && fs === 'accept')) {
        paymentPaid = true;
      }
    }
  } catch (err) {
    console.warn('Midtrans status check error:', err);
  }

  // Fallback to Xendit if not paid on Midtrans
  if (!paymentPaid) {
    const secretKey = process.env.XENDIT_SECRET_KEY;
    if (secretKey && !secretKey.includes('sample_key')) {
      try {
        const authHeader = `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
        const res = await fetch(
          `https://api.xendit.co/v2/invoices?external_id=${encodeURIComponent(orderCode)}`,
          {
            method: 'GET',
            headers: { Authorization: authHeader },
          }
        );
        if (res.ok) {
          const invoices = await res.json();
          const paidInvoice = invoices.find(
            (inv: any) => inv.status === 'PAID' || inv.status === 'SETTLED'
          );
          if (paidInvoice) {
            paymentPaid = true;
          }
        }
      } catch (err) {
        console.warn('Xendit invoice verification error:', err);
      }
    }
  }

  // 2. If confirmed paid, update order status and dispatch delivery
  if (paymentPaid) {
    const now = new Date();

    if (dbOnline) {
      try {
        const order = await prisma.order.findUnique({
          where: { orderCode },
          include: {
            orderItems: { include: { product: true } },
            paymentTransactions: true,
          },
        });

        if (order && order.paymentStatus !== 'paid') {
          const mainItem = order.orderItems[0];
          const product = mainItem?.product;
          const isManualCustom =
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

          if (isManualCustom) {
            // Manual delivery: set status to processing (wait for admin craft)
            await prisma.order.update({
              where: { id: order.id },
              data: {
                paymentStatus: 'paid',
                orderStatus: 'processing',
                deliveryStatus: 'processing',
                paidAt: now,
              },
            });

            // Update payment transaction
            await prisma.paymentTransaction
              .updateMany({
                where: { orderId: order.id },
                data: { status: 'paid' },
              })
              .catch(() => {});

            // Send notification email: Payment received, skin being crafted (~5 mins)
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
            // Automatic instant delivery
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

            // Update payment transaction
            await prisma.paymentTransaction
              .updateMany({
                where: { orderId: order.id },
                data: { status: 'paid' },
              })
              .catch(() => {});

            // Create digital delivery
            await prisma.digitalDelivery
              .create({
                data: {
                  orderId: order.id,
                  deliveryEmail: order.customerEmail,
                  deliveryStatus: 'delivered',
                  deliveryData: deliveryContent,
                  deliveredAt: now,
                },
              })
              .catch(() => {});

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
        }
      } catch (dbErr) {
        console.warn('DB update error during verify-payment:', dbErr);
      }
    }

    // Also update in-memory order
    const memOrder = inMemoryOrders.find((o) => o.orderCode === orderCode);
    if (memOrder && memOrder.paymentStatus !== 'paid') {
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
            const raw =
              memOrder.orderItems?.[0]?.product?.deliveryContent ||
              (memOrder as any).items?.[0]?.deliveryContent ||
              '';
            const lines = raw.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
            const dispatched = lines.length > 0 ? lines.slice(0, qty).join('\n') : raw;
            memOrder.deliveryContent = dispatched;
            memOrder.delivery_content = dispatched;
            memOrder.digital_delivery = { content: dispatched };
            decrementProductStock(prodId, qty);
          }
        }
      }
    }
  }

  // 3. Return current order status
  // Re-fetch to get latest data
  if (dbOnline) {
    try {
      const order = await prisma.order.findUnique({
        where: { orderCode },
        include: {
          orderItems: { include: { product: true } },
          paymentTransactions: true,
          digitalDeliveries: true,
        },
      });

      if (order) {
        const isPaid = order.paymentStatus === 'paid' || order.paymentStatus === 'paid_manual';
        let deliveryContent: string | null = null;

        if (isPaid) {
          const qty = order.orderItems?.[0]?.quantity || 1;
          const directDelivery = order.digitalDeliveries?.[0]?.deliveryData;
          if (directDelivery) {
            const lines = directDelivery.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
            deliveryContent = lines.length > 0 ? lines.slice(0, qty).join('\n') : directDelivery;
          } else {
            const raw = order.orderItems?.[0]?.product?.deliveryContent || '';
            const lines = raw.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
            deliveryContent = lines.length > 0 ? lines.slice(0, qty).join('\n') : (raw || null);
          }
        }

        const paymentTx = order.paymentTransactions?.[0];
        let txPayload: any = {};
        try {
          if (paymentTx?.rawPayload) {
            txPayload = JSON.parse(paymentTx.rawPayload);
          }
        } catch {}

        return NextResponse.json({
          success: true,
          data: {
            order_id: order.id,
            order_code: order.orderCode,
            customer_name: order.customerName,
            customer_email: order.customerEmail,
            customer_phone: order.customerPhone,
            customer_whatsapp: order.customerPhone,
            total_amount: order.totalAmount,
            order_status: order.orderStatus,
            payment_status: order.paymentStatus,
            delivery_status: order.deliveryStatus,
            delivery_content: deliveryContent,
            payment_method: order.paymentMethod,
            payment_url: paymentTx?.paymentUrl || null,
            product_name: order.orderItems?.[0]?.productNameSnapshot || 'Produk Digital',
            quantity: order.orderItems?.[0]?.quantity || 1,
            delivery_type: (order.orderItems?.[0]?.product as any)?.deliveryType || ((order.orderItems?.[0]?.product as any)?.serviceTag === 'pembuatan-cepat' ? 'manual' : 'automatic'),
            customer_notes: txPayload?.customer_notes || null,
            custom_skin_details: txPayload?.custom_skin_details || null,
            created_at: order.createdAt,
            paid_at: order.paidAt,
          },
        });
      }
    } catch {}
  }

  // In-memory fallback
  const memOrder = inMemoryOrders.find((o) => o.orderCode === orderCode);
  if (memOrder) {
    const isPaid = memOrder.paymentStatus === 'paid' || memOrder.paymentStatus === 'paid_manual';
    const qty = memOrder.quantity || memOrder.orderItems?.[0]?.quantity || 1;
    let deliveredStr =
      memOrder.deliveryContent ||
      memOrder.delivery_content ||
      memOrder.digital_delivery?.content ||
      null;

    if (deliveredStr) {
      const lines = deliveredStr.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
      if (lines.length > qty) {
        deliveredStr = lines.slice(0, qty).join('\n');
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        order_id: memOrder.id,
        order_code: memOrder.orderCode,
        customer_name: memOrder.customerName,
        customer_email: memOrder.customerEmail,
        customer_phone: memOrder.customerPhone,
        customer_whatsapp: memOrder.customerPhone,
        total_amount: memOrder.totalAmount,
        order_status: memOrder.orderStatus,
        payment_status: memOrder.paymentStatus,
        delivery_status: memOrder.deliveryStatus,
        delivery_content: isPaid ? deliveredStr : null,
        delivery_type: memOrder.deliveryType || 'manual',
        customer_notes: memOrder.customerNotes || memOrder.notes || null,
        custom_skin_details: memOrder.customSkinDetails || null,
        payment_method: memOrder.paymentMethod,
        payment_url: memOrder.paymentUrl || null,
        product_name: memOrder.orderItems?.[0]?.productNameSnapshot || memOrder.items?.[0]?.product_name || 'Produk Digital',
        quantity: qty,
        created_at: memOrder.createdAt,
        paid_at: memOrder.paidAt,
      },
    });
  }

  return NextResponse.json(
    { success: false, message: 'Pesanan tidak ditemukan' },
    { status: 404 }
  );
}
