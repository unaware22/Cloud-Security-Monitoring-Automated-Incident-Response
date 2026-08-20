import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getClientIp, detectSQLi, detectXSS, recordSecurityEvent } from '@/lib/security';

export const dynamic = 'force-dynamic';

const ManualPaymentSchema = z.object({
  order_code: z.string().trim().min(4),
  sender_name: z.string().trim().min(2).max(100),
  sender_bank: z.string().trim().min(2).max(50),
  amount: z.number().int().positive(),
  transfer_time: z.string().optional(),
  note: z.string().trim().max(300).optional(),
  proof_url: z.string().trim().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'Unknown';
  const requestId = req.headers.get('x-request-id') || `req-${Date.now()}`;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Bad Request', message: 'Format data tidak valid' },
      { status: 400 }
    );
  }

  const rawString = JSON.stringify(body);
  if (detectSQLi(rawString) || detectXSS(rawString)) {
    const eventType = detectSQLi(rawString) ? 'sql_injection_attempt' : 'xss_attempt';
    await recordSecurityEvent({
      eventType,
      severity: detectSQLi(rawString) ? 'high' : 'medium',
      ipAddress: ip,
      method: 'POST',
      endpoint: '/api/orders/manual-payment',
      userAgent,
      payloadSnippet: rawString.substring(0, 300),
      statusCode: 400,
      description: 'Attack pattern in manual payment submission',
      requestId,
    });

    return NextResponse.json(
      { error: 'Bad Request', message: 'Karakter terlarang terdeteksi' },
      { status: 400 }
    );
  }

  const parseResult = ManualPaymentSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: 'Validation Error',
        message: parseResult.error.errors[0]?.message || 'Data transfer tidak valid',
      },
      { status: 422 }
    );
  }

  const {
    order_code,
    sender_name,
    sender_bank,
    amount,
    transfer_time,
    note,
    proof_url,
  } = parseResult.data;

  try {
    const order = await prisma.order.findUnique({
      where: { orderCode: order_code.toUpperCase() },
    });

    if (!order) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Pesanan tidak ditemukan' },
        { status: 404 }
      );
    }

    if (order.paymentStatus === 'paid' || order.paymentStatus === 'paid_manual') {
      return NextResponse.json(
        { error: 'Already Paid', message: 'Pesanan ini sudah berhasil dibayar' },
        { status: 400 }
      );
    }

    // Save manual payment submission
    const submission = await prisma.manualPaymentSubmission.create({
      data: {
        orderId: order.id,
        senderName: sender_name,
        senderBank: sender_bank,
        amount,
        transferTime: transfer_time ? new Date(transfer_time) : new Date(),
        note: note || '',
        proofUrl: proof_url || '',
        status: 'submitted',
      },
    });

    // Update order status to pending_manual
    await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: 'pending_manual',
        orderStatus: 'waiting_payment',
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Konfirmasi pembayaran manual berhasil dikirim. Admin akan segera memverifikasi.',
      data: {
        submission_id: submission.id,
        order_code: order.orderCode,
        status: 'submitted',
      },
    });
  } catch (error) {
    console.error('Manual payment submission error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Gagal memproses konfirmasi pembayaran' },
      { status: 500 }
    );
  }
}
