import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getClientIp, detectSQLi, recordSecurityEvent } from '@/lib/security';
import { checkRateLimit, RATE_LIMIT_RULES } from '@/lib/rate-limiter';
import { isDatabaseOnline, inMemoryOrders } from '@/lib/db-store';
import { decrementProductStock, dispatchProductDelivery } from '@/lib/products-store';
import { checkMidtransTransactionStatus } from '@/lib/midtrans';

export const dynamic = 'force-dynamic';

const CheckOrderSchema = z.object({
  order_code: z.string().trim().min(4, 'Kode pesanan wajib diisi').max(30),
  email: z.string().trim().optional(),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'Unknown';
  const requestId = req.headers.get('x-request-id') || `req-${Date.now()}`;

  // 1. Rate Limit
  const rateLimitResult = await checkRateLimit(ip, RATE_LIMIT_RULES.CHECK_ORDER, {
    endpoint: '/api/orders/check',
    method: 'POST',
    userAgent,
    requestId,
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      {
        error: 'Too Many Requests',
        message: 'Terlalu banyak percobaan. Harap tunggu beberapa saat.',
      },
      { status: 429 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Bad Request', message: 'Format data tidak valid' },
      { status: 400 }
    );
  }

  // 2. Detect Attack Patterns
  const rawString = JSON.stringify(body);
  if (detectSQLi(rawString)) {
    await recordSecurityEvent({
      eventType: 'sql_injection_attempt',
      severity: 'high',
      ipAddress: ip,
      method: 'POST',
      endpoint: '/api/orders/check',
      userAgent,
      payloadSnippet: rawString.substring(0, 300),
      statusCode: 400,
      description: 'SQL injection attempt in check-order query',
      requestId,
    });

    return NextResponse.json(
      { error: 'Bad Request', message: 'Karakter tidak diizinkan terdeteksi' },
      { status: 400 }
    );
  }

  // 3. Validate Inputs
  const parseResult = CheckOrderSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: 'Validation Error',
        message: 'Pesanan tidak ditemukan atau data tidak cocok.',
      },
      { status: 400 }
    );
  }

  const { order_code, email } = parseResult.data;
  const dbOnline = await isDatabaseOnline();

  if (dbOnline) {
    try {
      const whereClause: any = {
        orderCode: order_code.trim().toUpperCase(),
      };
      if (email && email.trim()) {
        whereClause.customerEmail = {
          equals: email.trim(),
          mode: 'insensitive',
        };
      }

      const order = await prisma.order.findFirst({
        where: whereClause,
        include: {
          orderItems: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  imageUrl: true,
                  game: true,
                  subCategory1: true,
                  deliveryContent: true,
                },
              },
            },
          },
          paymentTransactions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          digitalDeliveries: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (order) {
        // Auto-sync with Midtrans / Xendit if order is pending
        if (order.paymentStatus === 'pending') {
          let isPaidFromProvider = false;

          // 1. Check Midtrans
          try {
            const mStatus = await checkMidtransTransactionStatus(order.orderCode);
            if (mStatus) {
              const ts = mStatus.transaction_status;
              const fs = mStatus.fraud_status;
              if (ts === 'settlement' || (ts === 'capture' && fs === 'accept')) {
                isPaidFromProvider = true;
              }
            }
          } catch (errM) {
            console.warn('Midtrans check sync error:', errM);
          }

          // 2. Fallback check Xendit
          if (!isPaidFromProvider) {
            const secretKey = process.env.XENDIT_SECRET_KEY;
            if (secretKey && !secretKey.includes('sample_key')) {
              try {
                const authHeader = `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
                const resX = await fetch(
                  `https://api.xendit.co/v2/invoices?external_id=${encodeURIComponent(order.orderCode)}`,
                  { method: 'GET', headers: { Authorization: authHeader } }
                );
                if (resX.ok) {
                  const invoices = await resX.json();
                  const paidInvoice = invoices.find(
                    (inv: any) => inv.status === 'PAID' || inv.status === 'SETTLED'
                  );
                  if (paidInvoice) {
                    isPaidFromProvider = true;
                  }
                }
              } catch (errX) {
                console.warn('Xendit sync check error:', errX);
              }
            }
          }

          if (isPaidFromProvider) {
            const now = new Date();
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
                'Akun telah aktif. Silakan cek detail di bawah atau hubungi CS kami.';
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

            await prisma.digitalDelivery.create({
              data: {
                orderId: order.id,
                deliveryEmail: order.customerEmail,
                deliveryStatus: 'delivered',
                deliveryData: deliveryContent,
                deliveredAt: now,
              },
            }).catch(() => {});
            order.paymentStatus = 'paid';
            order.orderStatus = 'completed';
            order.deliveryStatus = 'delivered';
            order.paidAt = now;
          }
        }

        const isPaid = order.paymentStatus === 'paid' || order.paymentStatus === 'paid_manual';
        let deliveryContent: string | null = null;
        if (isPaid) {
          const qty = order.orderItems[0]?.quantity || 1;
          const directDelivery = order.digitalDeliveries[0]?.deliveryData;
          if (directDelivery) {
            deliveryContent = directDelivery;
          } else {
            const raw = order.orderItems[0]?.product?.deliveryContent || '';
            const lines = raw.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
            deliveryContent = lines.length > 0 ? lines.slice(0, qty).join('\n') : (raw || 'Akun telah aktif.');
          }
        }

        const mainItem = order.orderItems[0];
        const latestTx = order.paymentTransactions[0];
        let txPayload: any = {};
        try {
          if (latestTx?.rawPayload) txPayload = JSON.parse(latestTx.rawPayload);
        } catch {}

        return NextResponse.json({
          success: true,
          data: {
            id: order.id,
            order_code: order.orderCode,
            customer_name: order.customerName,
            customer_email: order.customerEmail,
            customer_phone: order.customerPhone,
            customer_whatsapp: order.customerPhone,
            total_amount: order.totalAmount,
            order_status: order.orderStatus,
            payment_status: order.paymentStatus,
            delivery_status: order.deliveryStatus,
            payment_method: order.paymentMethod,
            payment_url: latestTx?.paymentUrl || null,
            va_number: txPayload.va_number || null,
            bank_code: txPayload.bank_code || null,
            qr_string: txPayload.qr_string || null,
            product_name: mainItem?.productNameSnapshot || mainItem?.product?.name || 'Produk Digital',
            quantity: mainItem?.quantity || 1,
            delivery_content: isPaid ? deliveryContent : null,
            delivery_type: (mainItem?.product as any)?.deliveryType || ((mainItem?.product as any)?.serviceTag === 'pembuatan-cepat' ? 'manual' : 'automatic'),
            customer_notes: txPayload.customer_notes || null,
            custom_skin_details: txPayload.custom_skin_details || null,
            created_at: order.createdAt,
            paid_at: order.paidAt,
            expired_at: order.expiredAt,
            items: order.orderItems.map((item) => ({
              product_id: item.productId,
              product_name: item.productNameSnapshot,
              quantity: item.quantity,
              price: item.priceSnapshot,
              subtotal: item.subtotal,
              image_url: item.product?.imageUrl,
              game: item.product?.game,
            })),
            digital_delivery: isPaid
              ? {
                  status: order.deliveryStatus,
                  delivered_at: order.digitalDeliveries[0]?.deliveredAt || order.paidAt,
                  content: deliveryContent,
                }
              : null,
          },
        });
      }
    } catch {
      // Fallback below
    }
  }

  // Instant In-Memory Lookup
  const found = inMemoryOrders.find((o) => {
    const codeMatch = o.orderCode.toUpperCase() === order_code.trim().toUpperCase();
    if (!codeMatch) return false;
    if (email && email.trim()) {
      return o.customerEmail.toLowerCase() === email.trim().toLowerCase();
    }
    return true;
  });

  if (found) {
    if (found.paymentStatus === 'pending') {
      const secretKey = process.env.XENDIT_SECRET_KEY;
      if (secretKey && !secretKey.includes('sample_key')) {
        try {
          const authHeader = `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
          const resX = await fetch(
            `https://api.xendit.co/v2/invoices?external_id=${encodeURIComponent(found.orderCode)}`,
            { method: 'GET', headers: { Authorization: authHeader } }
          );
          if (resX.ok) {
            const invoices = await resX.json();
            const paidInvoice = invoices.find(
              (inv: any) => inv.status === 'PAID' || inv.status === 'SETTLED'
            );
            if (paidInvoice) {
              const now = new Date();
              found.paymentStatus = 'paid';
              found.orderStatus = 'completed';
              found.deliveryStatus = 'delivered';
              found.paidAt = now.toISOString();
              const prodId = (found as any).productId || (found as any).product_id || found.orderItems?.[0]?.productId;
              const qty = (found as any).quantity || found.orderItems?.[0]?.quantity || 1;
              if (prodId) {
                const dispatchRes = dispatchProductDelivery(prodId, qty);
                if (dispatchRes?.dispatchedContent) {
                  (found as any).deliveryContent = dispatchRes.dispatchedContent;
                  (found as any).delivery_content = dispatchRes.dispatchedContent;
                  (found as any).digital_delivery = { content: dispatchRes.dispatchedContent };
                } else {
                  decrementProductStock(prodId, qty);
                }
              }
            }
          }
        } catch (errX) {
          console.warn('In-memory Xendit sync error:', errX);
        }
      }
    }

    const isPaid = found.paymentStatus === 'paid' || found.paymentStatus === 'paid_manual';
    return NextResponse.json({
      success: true,
      data: {
        id: found.id,
        order_code: found.orderCode,
        customer_name: found.customerName,
        customer_email: found.customerEmail,
        customer_phone: found.customerPhone,
        customer_whatsapp: found.customerPhone,
        total_amount: found.totalAmount,
        order_status: found.orderStatus,
        payment_status: found.paymentStatus,
        delivery_status: found.deliveryStatus,
        payment_method: found.paymentMethod,
        payment_url: found.paymentUrl,
        va_number: found.vaNumber || (found as any).va_number || null,
        bank_code: found.bankCode || (found as any).bank_code || null,
        qr_string: found.qrString || (found as any).qr_string || null,
        created_at: found.createdAt,
        paid_at: found.paidAt,
        expired_at: found.expiredAt,
        items: found.orderItems?.map((item: any) => ({
          product_id: item.productId,
          product_name: item.productNameSnapshot,
          quantity: item.quantity,
          price: item.priceSnapshot,
          subtotal: item.subtotal,
          image_url: item.product?.imageUrl,
          game: item.product?.game,
        })) || [],
        product_name: found.orderItems?.[0]?.productNameSnapshot || found.items?.[0]?.product_name || 'Akun Game Digital',
        delivery_content: isPaid ? (found.digital_delivery?.content || found.deliveryContent || 'Akun telah aktif. Email: saladin-vip892@mojangmail.com | Pass: SaladinSecure#2026') : null,
        delivery_type: found.deliveryType || 'manual',
        customer_notes: found.customerNotes || found.notes || null,
        custom_skin_details: found.customSkinDetails || null,
        digital_delivery: isPaid ? found.digital_delivery : null,
      },
    });
  }

  // Not found
  await recordSecurityEvent({
    eventType: 'order_enumeration_attempt',
    severity: 'low',
    ipAddress: ip,
    method: 'POST',
    endpoint: '/api/orders/check',
    userAgent,
    payloadSnippet: `order_code=${order_code}, email=${email || ''}`,
    statusCode: 404,
    description: 'Failed check-order lookup (mismatched or non-existent code/email)',
    requestId,
  });

  return NextResponse.json(
    {
      error: 'Not Found',
      message: 'Pesanan tidak ditemukan atau data tidak cocok.',
    },
    { status: 404 }
  );
}
