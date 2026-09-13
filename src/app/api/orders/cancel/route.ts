import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getClientIp, detectSQLi, recordSecurityEvent } from '@/lib/security';
import { checkRateLimit, RATE_LIMIT_RULES } from '@/lib/rate-limiter';
import { isDatabaseOnline, inMemoryOrders, isInMemoryFallbackEnabled } from '@/lib/db-store';
import { cancelMidtransTransaction, checkMidtransTransactionStatus } from '@/lib/midtrans';

export const dynamic = 'force-dynamic';

const CancelOrderSchema = z.object({
  order_code: z.string().trim().min(4).max(30),
  email: z.string().trim().email().max(150),
});

const PAID_STATUSES = new Set(['paid', 'paid_manual', 'settlement', 'capture']);
const FINAL_ORDER_STATUSES = new Set(['processing', 'completed']);

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'Unknown';
  const requestId = req.headers.get('x-request-id') || `req-${Date.now()}`;

  const rateLimitResult = await checkRateLimit(ip, RATE_LIMIT_RULES.CANCEL_ORDER, {
    endpoint: '/api/orders/cancel',
    method: 'POST',
    userAgent,
    requestId,
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests', message: 'Terlalu banyak permintaan pembatalan. Silakan tunggu sebentar.' },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Bad Request', message: 'Format data tidak valid.' },
      { status: 400 }
    );
  }

  const rawBody = JSON.stringify(body);
  if (detectSQLi(rawBody)) {
    await recordSecurityEvent({
      eventType: 'sql_injection_attempt',
      severity: 'high',
      ipAddress: ip,
      method: 'POST',
      endpoint: '/api/orders/cancel',
      userAgent,
      payloadSnippet: rawBody.substring(0, 300),
      statusCode: 400,
      description: 'SQL injection attempt in order cancellation request',
      requestId,
    });

    return NextResponse.json(
      { error: 'Bad Request', message: 'Data pembatalan tidak valid.' },
      { status: 400 }
    );
  }

  const parsed = CancelOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation Error', message: 'Kode pesanan atau email tidak valid.' },
      { status: 400 }
    );
  }

  const orderCode = parsed.data.order_code.toUpperCase();
  const email = parsed.data.email.toLowerCase();
  const dbOnline = await isDatabaseOnline();
  const allowInMemoryFallback = isInMemoryFallbackEnabled();

  if (dbOnline) {
    const order = await prisma.order.findFirst({
      where: {
        orderCode,
        customerEmail: { equals: email, mode: 'insensitive' },
      },
    });

    if (!order) {
      await recordSecurityEvent({
        eventType: 'order_cancellation_abuse',
        severity: 'low',
        ipAddress: ip,
        method: 'POST',
        endpoint: '/api/orders/cancel',
        userAgent,
        payloadSnippet: `order_code=${orderCode}`,
        statusCode: 404,
        description: 'Cancellation attempted with mismatched order code and email',
        requestId,
      });

      return NextResponse.json(
        { error: 'Not Found', message: 'Pesanan tidak ditemukan atau data tidak cocok.' },
        { status: 404 }
      );
    }

    if (order.orderStatus === 'cancelled' || order.paymentStatus === 'cancelled') {
      return NextResponse.json({
        success: true,
        message: 'Pesanan sudah dibatalkan sebelumnya.',
        data: {
          order_code: order.orderCode,
          order_status: 'cancelled',
          payment_status: 'cancelled',
          delivery_status: 'cancelled',
        },
      });
    }

    if (
      PAID_STATUSES.has(order.paymentStatus) ||
      FINAL_ORDER_STATUSES.has(order.orderStatus) ||
      order.deliveryStatus === 'delivered' ||
      order.paidAt
    ) {
      return NextResponse.json(
        {
          error: 'Conflict',
          message: 'Pesanan yang sudah dibayar atau diproses tidak dapat dibatalkan. Hubungi admin untuk proses refund.',
        },
        { status: 409 }
      );
    }

    const providerStatus = await checkMidtransTransactionStatus(order.orderCode);
    if (
      providerStatus &&
      (providerStatus.transaction_status === 'settlement' ||
        (providerStatus.transaction_status === 'capture' && providerStatus.fraud_status === 'accept'))
    ) {
      return NextResponse.json(
        {
          error: 'Conflict',
          message: 'Pembayaran telah diterima Midtrans sehingga pesanan tidak dapat dibatalkan.',
        },
        { status: 409 }
      );
    }

    const providerTransactionStatus = providerStatus?.transaction_status;
    const providerAlreadyFinal =
      providerTransactionStatus === 'cancel' ||
      providerTransactionStatus === 'expire' ||
      providerTransactionStatus === 'deny';

    if (!providerAlreadyFinal) {
      try {
        const providerCancellation = await cancelMidtransTransaction(order.orderCode);
        if (!providerCancellation.cancelled && !providerCancellation.notFound) {
          return NextResponse.json(
            {
              error: 'Bad Gateway',
              message: 'Midtrans menolak pembatalan transaksi. Silakan periksa kembali status pembayaran.',
            },
            { status: providerCancellation.statusCode === 412 ? 409 : 502 }
          );
        }
      } catch (error) {
        console.error('Midtrans cancellation error:', error);
        return NextResponse.json(
          {
            error: 'Bad Gateway',
            message: 'Status pembatalan belum dapat dipastikan dari Midtrans. Silakan coba kembali.',
          },
          { status: 502 }
        );
      }
    }

    const cancelled = await prisma.$transaction(async (tx) => {
      const result = await tx.order.updateMany({
        where: {
          id: order.id,
          paidAt: null,
          paymentStatus: { in: ['pending', 'pending_manual', 'failed', 'expired'] },
          orderStatus: { in: ['created', 'waiting_payment', 'expired'] },
        },
        data: {
          orderStatus: 'cancelled',
          paymentStatus: 'cancelled',
          deliveryStatus: 'cancelled',
        },
      });

      if (result.count !== 1) return false;

      await tx.paymentTransaction.updateMany({
        where: { orderId: order.id },
        data: { status: 'cancelled' },
      });

      return true;
    });

    if (!cancelled) {
      return NextResponse.json(
        { error: 'Conflict', message: 'Status pesanan berubah. Muat ulang dan periksa kembali.' },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Pesanan berhasil dibatalkan.',
      data: {
        order_code: order.orderCode,
        order_status: 'cancelled',
        payment_status: 'cancelled',
        delivery_status: 'cancelled',
      },
    });
  }

  if (allowInMemoryFallback) {
    const memoryOrder = inMemoryOrders.find(
      (item) =>
        item.orderCode.toUpperCase() === orderCode &&
        item.customerEmail.toLowerCase() === email
    );

    if (!memoryOrder) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Pesanan tidak ditemukan atau data tidak cocok.' },
        { status: 404 }
      );
    }

    if (PAID_STATUSES.has(memoryOrder.paymentStatus) || memoryOrder.deliveryStatus === 'delivered') {
      return NextResponse.json(
        { error: 'Conflict', message: 'Pesanan yang sudah dibayar tidak dapat dibatalkan.' },
        { status: 409 }
      );
    }

    memoryOrder.orderStatus = 'cancelled';
    memoryOrder.paymentStatus = 'cancelled';
    memoryOrder.deliveryStatus = 'cancelled';

    return NextResponse.json({
      success: true,
      message: 'Pesanan berhasil dibatalkan.',
      data: {
        order_code: memoryOrder.orderCode,
        order_status: memoryOrder.orderStatus,
        payment_status: memoryOrder.paymentStatus,
        delivery_status: memoryOrder.deliveryStatus,
      },
    });
  }

  return NextResponse.json(
    { error: 'Service Unavailable', message: 'Database pesanan sedang tidak tersedia.' },
    { status: 503 }
  );
}
