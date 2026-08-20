import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getClientIp, detectSQLi, recordSecurityEvent } from '@/lib/security';
import { checkRateLimit, RATE_LIMIT_RULES } from '@/lib/rate-limiter';
import { isDatabaseOnline, inMemoryOrders } from '@/lib/db-store';

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
        const isPaid = order.paymentStatus === 'paid' || order.paymentStatus === 'paid_manual';
        let deliveryContent: string | null = null;
        if (isPaid) {
          deliveryContent =
            order.digitalDeliveries[0]?.deliveryData ||
            order.orderItems[0]?.product?.deliveryContent ||
            'Produk siap digunakan. Silakan cek email Anda.';
        }

        const latestTx = order.paymentTransactions[0];

        return NextResponse.json({
          success: true,
          data: {
            id: order.id,
            order_code: order.orderCode,
            customer_name: order.customerName,
            customer_email: order.customerEmail,
            customer_phone: order.customerPhone,
            total_amount: order.totalAmount,
            order_status: order.orderStatus,
            payment_status: order.paymentStatus,
            delivery_status: order.deliveryStatus,
            payment_method: order.paymentMethod,
            payment_url: latestTx?.paymentUrl || null,
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
    const isPaid = found.paymentStatus === 'paid' || found.paymentStatus === 'paid_manual';
    return NextResponse.json({
      success: true,
      data: {
        id: found.id,
        order_code: found.orderCode,
        customer_name: found.customerName,
        customer_email: found.customerEmail,
        customer_phone: found.customerPhone,
        total_amount: found.totalAmount,
        order_status: found.orderStatus,
        payment_status: found.paymentStatus,
        delivery_status: found.deliveryStatus,
        payment_method: found.paymentMethod,
        payment_url: found.paymentUrl,
        created_at: found.createdAt,
        paid_at: found.paidAt,
        expired_at: found.expiredAt,
        items: found.orderItems.map((item: any) => ({
          product_id: item.productId,
          product_name: item.productNameSnapshot,
          quantity: item.quantity,
          price: item.priceSnapshot,
          subtotal: item.subtotal,
          image_url: item.product?.imageUrl,
          game: item.product?.game,
        })),
        product_name: found.orderItems?.[0]?.productNameSnapshot || found.items?.[0]?.product_name || 'Akun Minecraft Java & Bedrock Edition',
        delivery_content: isPaid ? (found.digital_delivery?.content || found.deliveryContent || 'Akun telah aktif. Email: saladin-vip892@mojangmail.com | Pass: SaladinSecure#2026') : null,
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
