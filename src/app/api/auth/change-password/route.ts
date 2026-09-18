import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getCustomerSession, createUserToken, CUSTOMER_COOKIE_NAME } from '@/lib/user-auth';
import {
  getClientIp,
  verifyPassword,
  hashPassword,
  recordSecurityEvent,
} from '@/lib/security';
import { checkRateLimit, RATE_LIMIT_RULES } from '@/lib/rate-limiter';

export const dynamic = 'force-dynamic';

const ChangePasswordSchema = z
  .object({
    current_password: z.string().min(1, 'Password saat ini wajib diisi'),
    new_password: z
      .string()
      .min(8, 'Password baru minimal 8 karakter')
      .max(128)
      .regex(/[a-z]/, 'Password baru harus mengandung huruf kecil')
      .regex(/[A-Z]/, 'Password baru harus mengandung huruf besar')
      .regex(/[0-9]/, 'Password baru harus mengandung angka'),
  })
  .refine((data) => data.current_password !== data.new_password, {
    message: 'Password baru tidak boleh sama dengan password saat ini',
    path: ['new_password'],
  });

export async function POST(req: NextRequest) {
  const session = await getCustomerSession(req);
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Sesi Anda telah berakhir. Silakan login kembali.' },
      { status: 401 }
    );
  }

  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'Unknown';
  const requestId = req.headers.get('x-request-id') || `req-${Date.now()}`;

  // 1. Rate Limit
  const rateLimitResult = await checkRateLimit(ip, RATE_LIMIT_RULES.CHANGE_PASSWORD, {
    endpoint: '/api/auth/change-password',
    method: 'POST',
    userAgent,
    requestId,
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests', message: 'Terlalu banyak percobaan ganti password. Harap tunggu.' },
      { status: 429 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad Request', message: 'Format data tidak valid' }, { status: 400 });
  }

  const normalizedBody = {
    current_password: body?.current_password || body?.old_password,
    new_password: body?.new_password,
  };

  const parseResult = ChangePasswordSchema.safeParse(normalizedBody);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Validation Error', message: parseResult.error.errors[0]?.message || 'Data tidak valid' },
      { status: 422 }
    );
  }

  const { current_password, new_password } = parseResult.data;

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
    });

    if (!user || user.sessionVersion !== session.sessionVersion) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Sesi tidak valid.' },
        { status: 401 }
      );
    }

    if (!user.passwordHash) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Akun ini terdaftar via Google dan belum memiliki password lokal.' },
        { status: 400 }
      );
    }

    const isCurrentValid = await verifyPassword(current_password, user.passwordHash);
    if (!isCurrentValid) {
      await recordSecurityEvent({
        eventType: 'user_bruteforce_attempt',
        severity: 'medium',
        ipAddress: ip,
        method: 'POST',
        endpoint: '/api/auth/change-password',
        userAgent,
        payloadSnippet: `userId=${user.id}; reason=incorrect_current_password`,
        statusCode: 401,
        description: 'Failed change password: incorrect current password',
        requestId,
      });

      return NextResponse.json(
        { error: 'Unauthorized', message: 'Password saat ini tidak sesuai.' },
        { status: 401 }
      );
    }

    const newHash = await hashPassword(new_password);
    const updatedUser = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: newHash,
          sessionVersion: { increment: 1 },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'USER_PASSWORD_CHANGED',
          entityType: 'users',
          entityId: user.id,
          ipAddress: ip,
          userAgent,
        },
      });

      return u;
    });

    // Re-issue new token for current device with the incremented sessionVersion
    const freshToken = await createUserToken({
      userId: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      role: 'customer',
      sessionVersion: updatedUser.sessionVersion,
    });

    const response = NextResponse.json({
      success: true,
      message: 'Kata sandi berhasil diubah! Semua sesi di perangkat lain telah dinonaktifkan.',
    });

    response.cookies.set({
      name: CUSTOMER_COOKIE_NAME,
      value: freshToken,
      httpOnly: true,
      secure:
        req.headers.get('x-forwarded-proto') === 'https' ||
        req.nextUrl.protocol === 'https:',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 3600,
    });

    return response;
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Gagal mengubah kata sandi.' },
      { status: 500 }
    );
  }
}
