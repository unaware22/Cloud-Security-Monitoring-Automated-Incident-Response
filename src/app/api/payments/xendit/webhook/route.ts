import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getClientIp, recordSecurityEvent } from '@/lib/security';
import { verifyXenditWebhookToken } from '@/lib/xendit';
import { checkRateLimit, RATE_LIMIT_RULES } from '@/lib/rate-limiter';
import { sendDigitalDelivery } from '@/lib/email';

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
    const paidAmount = payload.paid_amount || payload.amount;

    if (!externalId) {
      return NextResponse.json(
        { error: 'Unprocessable Entity', message: 'Missing external_id' },
        { status: 422 }
      );
    }

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

    if (!order) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Order reference not found' },
        { status: 404 }
      );
    }

    // 4. Idempotency Check: Already processed
    if (order.paymentStatus === 'paid') {
      return NextResponse.json({
        success: true,
        message: 'Webhook already processed for this order (Idempotent)',
      });
    }

    if (status === 'PAID' || status === 'SETTLED') {
      // Update Order Status
      await prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: 'paid',
          orderStatus: 'processing',
          paidAt: new Date(),
        },
      });

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
      const mainItem = order.orderItems[0];
      const deliveryContent =
        mainItem?.product?.deliveryContent || 'Digital item activated';

      await sendDigitalDelivery({
        orderId: order.id,
        recipientEmail: order.customerEmail,
        orderCode: order.orderCode,
        productName: mainItem?.productNameSnapshot || 'Digital Item',
        deliveryContent,
      });

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
