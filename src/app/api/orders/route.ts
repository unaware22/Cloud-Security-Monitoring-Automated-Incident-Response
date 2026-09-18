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
import { createMidtransSnapTransaction, calculatePaymentFee } from '@/lib/midtrans';
import { fallbackStore } from '@/lib/products-store';
import { isDatabaseOnline, inMemoryOrders, isInMemoryFallbackEnabled } from '@/lib/db-store';
import { getTurnstileConfigurationStatus, verifyTurnstileToken } from '@/lib/turnstile';
import { getCustomerSession } from '@/lib/user-auth';

export const dynamic = 'force-dynamic';

const CheckoutSchema = z.object({
  product_id: z.string().min(1, 'Produk wajib dipilih'),
  quantity: z.number().int().min(1).default(1),
  customer_name: z.string().trim().min(2, 'Nama lengkap wajib diisi').max(100),
  customer_email: z.string().trim().email('Format email tidak valid').max(150),
  customer_phone: z.string().trim().min(8, 'Nomor telepon tidak valid').max(20),
  payment_method: z.string().default('va_mandiri'),
  voucher_code: z.string().trim().max(50).optional(),
  notes: z.string().trim().max(1000).optional(),
  skin_description: z.string().trim().optional(),
  skin_size: z.string().trim().optional(),
  skin_model: z.string().trim().optional(),
  skin_reference_image: z.string().optional(),
  custom_skin_details: z.any().optional(),
  turnstile_token: z.string().trim().min(1).max(2048).optional(),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'Unknown';
  const requestId = req.headers.get('x-request-id') || `req-${Date.now()}`;

  // 1. Rate Limiting Check
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
        message: 'Terlalu banyak permintaan checkout. Harap tunggu beberapa saat.',
      },
      { status: 429 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Bad Request', message: 'Format data payload tidak valid' },
      { status: 400 }
    );
  }

  // 2. Detect Attack Patterns in Raw Payload
  const securityBody = {
    ...body,
    ...(body?.turnstile_token ? { turnstile_token: '[REDACTED]' } : {}),
  };
  const rawString = JSON.stringify(securityBody);
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
    voucher_code,
    notes,
    skin_description,
    skin_size,
    skin_model,
    skin_reference_image,
    custom_skin_details,
    turnstile_token,
  } = parseResult.data;

  // 4. Verify the single-use anti-bot token before calling Midtrans or writing an order.
  const turnstileConfiguration = getTurnstileConfigurationStatus();
  if (turnstileConfiguration.misconfigured) {
    console.error('[Turnstile Configuration Error]: Site key and secret key must both be configured');
    return NextResponse.json(
      { error: 'Service Unavailable', message: 'Verifikasi keamanan checkout belum terkonfigurasi lengkap.' },
      { status: 503 }
    );
  }

  if (turnstileConfiguration.enabled) {
    if (!turnstile_token) {
      await recordSecurityEvent({
        eventType: 'bot_order_attempt',
        severity: 'medium',
        ipAddress: ip,
        method: 'POST',
        endpoint: '/api/orders',
        userAgent,
        payloadSnippet: 'turnstile_token=missing',
        statusCode: 400,
        description: 'Checkout request was rejected because the Turnstile token was missing',
        requestId,
      });
      return NextResponse.json(
        { error: 'Bad Request', message: 'Verifikasi CAPTCHA wajib diselesaikan sebelum membuat pesanan.' },
        { status: 400 }
      );
    }

    const verification = await verifyTurnstileToken(turnstile_token, ip);
    if (!verification.success) {
      await recordSecurityEvent({
        eventType: 'bot_order_attempt',
        severity: 'medium',
        ipAddress: ip,
        method: 'POST',
        endpoint: '/api/orders',
        userAgent,
        payloadSnippet: `turnstile_errors=${verification.errorCodes.join(',') || 'unknown'}`,
        statusCode: 403,
        description: 'Checkout request failed Cloudflare Turnstile verification',
        requestId,
      });
      return NextResponse.json(
        { error: 'Forbidden', message: 'Verifikasi CAPTCHA gagal atau kedaluwarsa. Silakan ulangi.' },
        { status: 403 }
      );
    }
  }

  const dbOnline = await isDatabaseOnline();
  const allowInMemoryFallback = isInMemoryFallbackEnabled();

  if (!dbOnline && !allowInMemoryFallback) {
    return NextResponse.json(
      { error: 'Service Unavailable', message: 'Layanan pesanan sedang tidak tersedia. Silakan coba kembali.' },
      { status: 503 }
    );
  }

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

  if (!product && allowInMemoryFallback) {
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

  const isSkinProduct =
    product.slug.includes('skin') ||
    product.name.toLowerCase().includes('skin') ||
    product.subCategory1 === 'skins' ||
    product.serviceTag === 'pembuatan-cepat';

  let customSkinPayload: any = null;
  if (isSkinProduct || skin_description || skin_size || skin_model) {
    const desc = skin_description || custom_skin_details?.description || '';
    if (isSkinProduct && desc.trim().length < 20) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: 'Deskripsi skin impian minimal 20 karakter agar hasil sesuai.',
        },
        { status: 422 }
      );
    }
    customSkinPayload = {
      description: desc.trim(),
      skinSize: skin_size || custom_skin_details?.skinSize || '64x64',
      skinModel: skin_model || custom_skin_details?.skinModel || 'wide',
      referenceImageUrl: skin_reference_image || custom_skin_details?.referenceImageUrl || null,
    };
  }

  let combinedNotes = notes ? notes.trim() : '';
  if (customSkinPayload) {
    const skinSummary = `[SKIN CUSTOM] Ukuran: ${customSkinPayload.skinSize === '32x32' ? '32x32 px' : '64x64 px'} | Model: ${customSkinPayload.skinModel === 'slim' ? 'Slim (Alex)' : 'Wide (Steve)'}${customSkinPayload.referenceImageUrl ? ' | [Ada Referensi Gambar]' : ''}\nDeskripsi:\n${customSkinPayload.description}`;
    combinedNotes = combinedNotes ? `${combinedNotes}\n\n${skinSummary}` : skinSummary;
  }

  const productSubtotal = product.price * quantity;

  // Customer Session & Voucher Application
  const customerSession = await getCustomerSession(req);
  let appliedVoucher: any = null;
  let discountAmount = 0;
  const requestedVoucherCode = voucher_code?.trim().toUpperCase();

  if (requestedVoucherCode) {
    if (!customerSession) {
      return NextResponse.json(
        {
          error: 'Forbidden',
          message: `Voucher ${requestedVoucherCode} khusus untuk akun yang telah login. Silakan login terlebih dahulu untuk klaim diskon.`,
        },
        { status: 403 }
      );
    }

    if (dbOnline) {
      const voucher = await prisma.voucher.findUnique({
        where: { code: requestedVoucherCode },
      });

      const now = new Date();
      if (!voucher || !voucher.isActive || now < voucher.startDate || now > voucher.endDate) {
        return NextResponse.json(
          { error: 'Bad Request', message: 'Kode voucher tidak valid atau telah kedaluwarsa.' },
          { status: 400 }
        );
      }

      if (productSubtotal < voucher.minSubtotal) {
        return NextResponse.json(
          {
            error: 'Bad Request',
            message: `Minimal subtotal produk untuk voucher ${voucher.code} adalah Rp${voucher.minSubtotal.toLocaleString('id-ID')}.`,
          },
          { status: 400 }
        );
      }

      if (voucher.singleUsePerAccount) {
        const used = await prisma.voucherUsage.findFirst({
          where: { voucherId: voucher.id, userId: customerSession.userId },
        });
        if (used) {
          return NextResponse.json(
            { error: 'Bad Request', message: `Voucher ${voucher.code} sudah pernah Anda gunakan sebelumnya.` },
            { status: 400 }
          );
        }
      }

      appliedVoucher = voucher;
      discountAmount = voucher.discountAmount;
    }
  }

  const discountedProductSubtotal = Math.max(0, productSubtotal - discountAmount);
  const feeData = calculatePaymentFee(discountedProductSubtotal);
  const totalAmount = feeData.totalWithFee;
  const adminFee = feeData.totalFee;

  const orderCode = generateOrderCode();
  const expiredAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 Hours
  const initialPaymentStatus = 'pending';

  // 5. Create Midtrans Snap Transaction
  let paymentUrl: string | null = null;
  let providerInvoiceId: string | null = null;

  try {
    const snapData = await createMidtransSnapTransaction({
      orderId: orderCode,
      grossAmount: totalAmount,
      productPrice: discountedProductSubtotal,
      feeAmount: adminFee,
      customerName: customer_name,
      customerEmail: customer_email,
      customerPhone: customer_phone,
      productName: product.name,
      productId: product.id,
      quantity,
      paymentMethod: payment_method,
    });

    paymentUrl = snapData.redirectUrl;
    providerInvoiceId = snapData.token;
  } catch (invErr) {
    console.error('Midtrans Snap creation error:', invErr);
    return NextResponse.json(
      {
        error: 'Bad Gateway',
        message: 'Gateway pembayaran Midtrans belum dapat membuat transaksi. Silakan coba kembali.',
      },
      { status: 502 }
    );
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
            userId: customerSession?.userId || null,
            voucherCode: appliedVoucher?.code || null,
            discountAmount,
            orderStatus: 'waiting_payment',
            paymentStatus: initialPaymentStatus,
            deliveryStatus: 'pending',
            paymentMethod: payment_method,
            expiredAt,
          },
        });

        if (appliedVoucher && customerSession) {
          await tx.voucherUsage.create({
            data: {
              voucherId: appliedVoucher.id,
              userId: customerSession.userId,
              orderId: order.id,
            },
          });
        }

        await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: product.id,
            productNameSnapshot: product.name,
            quantity,
            priceSnapshot: product.price,
            subtotal: productSubtotal,
          },
        });

        await tx.paymentTransaction.create({
          data: {
            orderId: order.id,
            provider: 'midtrans',
            providerInvoiceId,
            paymentUrl,
            amount: totalAmount,
            status: initialPaymentStatus,
            rawPayload: JSON.stringify({
              payment_method,
              provider_invoice_id: providerInvoiceId,
              product_subtotal: productSubtotal,
              discount_amount: discountAmount,
              voucher_code: appliedVoucher?.code || null,
              admin_fee: adminFee,
              customer_notes: combinedNotes || null,
              custom_skin_details: customSkinPayload || null,
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
            snap_token: providerInvoiceId,
            provider_invoice_id: providerInvoiceId,
            expired_at: newOrder.expiredAt,
          },
        },
        { status: 201 }
      );
    } catch (dbErr) {
      console.error('DB transaction failed while creating order:', dbErr);
      if (!allowInMemoryFallback) {
        return NextResponse.json(
          { error: 'Service Unavailable', message: 'Pesanan belum dapat dibuat. Silakan coba kembali.' },
          { status: 503 }
        );
      }
    }
  }

  // 7. Instant In-Memory Fallback Order Record
  if (!allowInMemoryFallback) {
    return NextResponse.json(
      { error: 'Service Unavailable', message: 'Layanan pesanan sedang tidak tersedia. Silakan coba kembali.' },
      { status: 503 }
    );
  }

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
    paymentUrl: paymentUrl,
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
    deliveryContent: null,
    delivery_content: null,
    deliveryType: product.deliveryType || (isSkinProduct ? 'manual' : 'automatic'),
    digital_delivery: null,
    customerNotes: combinedNotes || null,
    notes: combinedNotes || null,
    customSkinDetails: customSkinPayload || null,
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
        snap_token: providerInvoiceId,
        provider_invoice_id: providerInvoiceId,
        expired_at: memoryOrderRecord.expiredAt,
      },
    },
    { status: 201 }
  );
}
