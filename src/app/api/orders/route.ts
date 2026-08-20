import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import {
  getClientIp,
  detectSQLi,
  detectXSS,
  generateOrderCode,
  recordSecurityEvent,
} from '@/lib/security';
import { checkRateLimit, RATE_LIMIT_RULES } from '@/lib/rate-limiter';
import { createXenditInvoice } from '@/lib/xendit';
import { fallbackStore } from '@/lib/products-store';
import { isDatabaseOnline, inMemoryOrders } from '@/lib/db-store';

export const dynamic = 'force-dynamic';

const CheckoutSchema = z.object({
  product_id: z.string().min(1, 'Product ID is required'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1').max(20, 'Max quantity is 20'),
  customer_name: z.string().trim().min(2, 'Name is too short').max(100, 'Name is too long'),
  customer_email: z.string().trim().email('Invalid email address').max(120),
  customer_phone: z.string().trim().min(8, 'Phone number is too short').max(20, 'Phone number is too long'),
  payment_method: z.enum(['xendit_invoice', 'manual_transfer', 'manual_qris']),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'Unknown';
  const requestId = req.headers.get('x-request-id') || `req-${Date.now()}`;

  // 1. Check Rate Limit
  const rateLimitResult = await checkRateLimit(ip, RATE_LIMIT_RULES.CHECKOUT, {
    endpoint: '/api/orders',
    method: 'POST',
    userAgent,
    requestId,
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      {
        error: 'Too Many Requests',
        message: 'Rate limit exceeded for checkout. Please wait a minute.',
      },
      { status: 429 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Bad Request', message: 'Malformed JSON payload' },
      { status: 400 }
    );
  }

  // 2. Detect Attack Patterns in Raw Payload
  const rawString = JSON.stringify(body);
  if (detectSQLi(rawString) || detectXSS(rawString)) {
    const eventType = detectSQLi(rawString) ? 'sql_injection_attempt' : 'xss_attempt';
    await recordSecurityEvent({
      eventType,
      severity: detectSQLi(rawString) ? 'high' : 'medium',
      ipAddress: ip,
      method: 'POST',
      endpoint: '/api/orders',
      userAgent,
      payloadSnippet: rawString.substring(0, 300),
      statusCode: 400,
      description: `Attack attempt in checkout form payload (${eventType})`,
      requestId,
    });

    return NextResponse.json(
      { error: 'Bad Request', message: 'Invalid or prohibited characters detected' },
      { status: 400 }
    );
  }

  // 3. Validate Schema
  const parseResult = CheckoutSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: 'Validation Error',
        message: parseResult.error.errors[0]?.message || 'Invalid input data',
        details: parseResult.error.errors,
      },
      { status: 422 }
    );
  }

  const {
    product_id,
    quantity,
    customer_name,
    customer_email,
    customer_phone,
    payment_method,
  } = parseResult.data;

  const dbOnline = await isDatabaseOnline();

  // Retrieve Product
  let product: any = null;
  if (dbOnline) {
    try {
      product = await prisma.product.findFirst({
        where: {
          OR: [{ id: product_id }, { slug: product_id }],
          isActive: true,
        },
      });
    } catch {
      product = null;
    }
  }

  if (!product) {
    product = fallbackStore.getProductById(product_id) || fallbackStore.getProductBySlug(product_id);
  }

  if (!product) {
    return NextResponse.json(
      { error: 'Not Found', message: 'Produk tidak ditemukan atau tidak aktif' },
      { status: 404 }
    );
  }

  if (product.stock < quantity) {
    return NextResponse.json(
      {
        error: 'Out of Stock',
        message: `Stok tersisa hanya ${product.stock} unit`,
      },
      { status: 400 }
    );
  }

  const totalAmount = product.price * quantity;
  const orderCode = generateOrderCode();
  const expiredAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 Hours
  const initialPaymentStatus =
    payment_method === 'xendit_invoice' ? 'pending' : 'pending_manual';

  // 5. If Xendit, initialize invoice
  let paymentUrl: string | null = null;
  let providerInvoiceId: string | null = null;

  if (payment_method === 'xendit_invoice') {
    const invoiceData = await createXenditInvoice({
      externalId: orderCode,
      amount: totalAmount,
      payerEmail: customer_email,
      description: `Order ${orderCode} - ${product.name}`,
      customerName: customer_name,
      customerPhone: customer_phone,
    });

    paymentUrl = invoiceData.invoiceUrl;
    providerInvoiceId = invoiceData.invoiceId;
  } else {
    const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    paymentUrl = `${baseUrl}/payment/${orderCode}`;
  }

  // 6. If DB Online, execute PostgreSQL transaction
  if (dbOnline) {
    try {
      const newOrder = await prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            orderCode,
            customerName: customer_name,
            customerEmail: customer_email,
            customerPhone: customer_phone,
            totalAmount,
            orderStatus: 'waiting_payment',
            paymentStatus: initialPaymentStatus,
            deliveryStatus: 'pending',
            paymentMethod: payment_method,
            expiredAt,
          },
        });

        await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: product.id,
            productNameSnapshot: product.name,
            quantity,
            priceSnapshot: product.price,
            subtotal: totalAmount,
          },
        });

        await tx.paymentTransaction.create({
          data: {
            orderId: order.id,
            provider: payment_method === 'xendit_invoice' ? 'xendit' : 'manual',
            providerInvoiceId,
            paymentUrl,
            amount: totalAmount,
            status: initialPaymentStatus,
            rawPayload: JSON.stringify({
              payment_method,
              provider_invoice_id: providerInvoiceId,
            }),
          },
        });

        return order;
      });

      return NextResponse.json(
        {
          success: true,
          data: {
            order_id: newOrder.id,
            order_code: newOrder.orderCode,
            customer_name: newOrder.customerName,
            customer_email: newOrder.customerEmail,
            total_amount: newOrder.totalAmount,
            order_status: newOrder.orderStatus,
            payment_status: newOrder.paymentStatus,
            payment_method: newOrder.paymentMethod,
            payment_url: paymentUrl,
            expired_at: newOrder.expiredAt,
          },
        },
        { status: 201 }
      );
    } catch (dbErr) {
      console.warn('DB Transaction failed, falling back to memory store:', dbErr);
    }
  }

  // 7. Instant In-Memory Fallback Order Record
  const memoryOrderRecord = {
    id: `ord-${Date.now()}`,
    orderCode,
    customerName: customer_name,
    customerEmail: customer_email,
    customerPhone: customer_phone,
    totalAmount,
    orderStatus: 'waiting_payment',
    paymentStatus: initialPaymentStatus,
    deliveryStatus: 'pending',
    paymentMethod: payment_method,
    paymentUrl,
    expiredAt: expiredAt.toISOString(),
    createdAt: new Date().toISOString(),
    items: [
      {
        product_id: product.id,
        product_name: product.name,
        game: product.game,
        price: product.price,
        quantity,
        image_url: product.imageUrl,
      },
    ],
    orderItems: [
      {
        productId: product.id,
        productNameSnapshot: product.name,
        priceSnapshot: product.price,
        quantity,
        subtotal: totalAmount,
        product,
      },
    ],
    productId: product.id,
    quantity,
    deliveryContent: product.deliveryContent || 'Email: saladin-vip892@mojangmail.com | Pass: SaladinSecure#2026 | Full Access: https://account.mojang.com',
    delivery_content: product.deliveryContent || 'Email: saladin-vip892@mojangmail.com | Pass: SaladinSecure#2026 | Full Access: https://account.mojang.com',
    digital_delivery: {
      content: product.deliveryContent || 'Email: saladin-vip892@mojangmail.com | Pass: SaladinSecure#2026 | Full Access: https://account.mojang.com',
    },
  };

  inMemoryOrders.unshift(memoryOrderRecord);

  return NextResponse.json(
    {
      success: true,
      data: {
        order_id: memoryOrderRecord.id,
        order_code: memoryOrderRecord.orderCode,
        customer_name: memoryOrderRecord.customerName,
        customer_email: memoryOrderRecord.customerEmail,
        total_amount: memoryOrderRecord.totalAmount,
        order_status: memoryOrderRecord.orderStatus,
        payment_status: memoryOrderRecord.paymentStatus,
        payment_method: memoryOrderRecord.paymentMethod,
        payment_url: paymentUrl,
        expired_at: memoryOrderRecord.expiredAt,
      },
    },
    { status: 201 }
  );
}
