import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCustomerSession } from '@/lib/user-auth';
import { getClientIp } from '@/lib/security';
import { checkRateLimit, RATE_LIMIT_RULES } from '@/lib/rate-limiter';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'Unknown';
  const requestId = req.headers.get('x-request-id') || `req-${Date.now()}`;

  // 1. Rate Limit
  const rateLimitResult = await checkRateLimit(ip, RATE_LIMIT_RULES.APPLY_VOUCHER, {
    endpoint: '/api/vouchers/validate',
    method: 'POST',
    userAgent,
    requestId,
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests', message: 'Terlalu banyak permintaan validasi voucher.' },
      { status: 429 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad Request', message: 'Format data tidak valid' }, { status: 400 });
  }

  const code = (body?.code || body?.voucher_code || '').trim().toUpperCase();
  const subtotal = Number(body?.subtotal || 0);

  if (!code) {
    return NextResponse.json(
      { success: false, valid: false, error: 'EMPTY_CODE', message: 'Harap masukkan kode voucher' },
      { status: 400 }
    );
  }

  try {
    // 2. Query Voucher from DB
    const voucher = await prisma.voucher.findUnique({
      where: { code },
    });

    if (!voucher || !voucher.isActive) {
      return NextResponse.json(
        { valid: false, error: 'NOT_FOUND', message: 'Kode voucher tidak ditemukan atau sudah tidak aktif.' },
        { status: 404 }
      );
    }

    // 3. Check Validity Dates
    const now = new Date();
    if (now < voucher.startDate || now > voucher.endDate) {
      return NextResponse.json(
        { valid: false, error: 'EXPIRED', message: 'Masa berlaku voucher telah berakhir.' },
        { status: 400 }
      );
    }

    // 4. Check Authentication requirement
    const session = await getCustomerSession(req);
    if (voucher.requiresAuth && !session) {
      return NextResponse.json(
        {
          valid: false,
          error: 'LOGIN_REQUIRED',
          message: `Voucher ${voucher.code} khusus untuk pelanggan yang telah login. Silakan login atau buat akun terlebih dahulu untuk menikmati diskon Rp${voucher.discountAmount.toLocaleString('id-ID')}.`,
        },
        { status: 401 }
      );
    }

    // 5. Check Minimum Subtotal
    if (subtotal < voucher.minSubtotal) {
      return NextResponse.json(
        {
          valid: false,
          error: 'MIN_SUBTOTAL_NOT_MET',
          message: `Minimal subtotal produk untuk voucher ini adalah Rp${voucher.minSubtotal.toLocaleString('id-ID')} (subtotal saat ini: Rp${subtotal.toLocaleString('id-ID')}).`,
        },
        { status: 400 }
      );
    }

    // 6. Check Single Use Per Account
    if (voucher.singleUsePerAccount && session) {
      const existingUsage = await prisma.voucherUsage.findFirst({
        where: {
          voucherId: voucher.id,
          userId: session.userId,
        },
      });

      if (existingUsage) {
        return NextResponse.json(
          {
            valid: false,
            error: 'ALREADY_USED',
            message: `Anda sudah pernah menggunakan voucher ${voucher.code} sebelumnya. Voucher ini hanya berlaku 1 kali per akun.`,
          },
          { status: 400 }
        );
      }
    }

    // 7. Success
    return NextResponse.json({
      success: true,
      valid: true,
      data: {
        id: voucher.id,
        voucher_code: voucher.code,
        discount_amount: voucher.discountAmount,
        name: voucher.name,
        min_subtotal: voucher.minSubtotal,
      },
      voucher: {
        id: voucher.id,
        code: voucher.code,
        name: voucher.name,
        discountAmount: voucher.discountAmount,
        minSubtotal: voucher.minSubtotal,
      },
      message: `Voucher ${voucher.code} berhasil diterapkan! Diskon Rp${voucher.discountAmount.toLocaleString('id-ID')}.`,
    });
  } catch (error) {
    console.error('Voucher validation error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Gagal memvalidasi kode voucher.' },
      { status: 500 }
    );
  }
}
