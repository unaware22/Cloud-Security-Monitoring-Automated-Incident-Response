import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import {
  getClientIp,
  hashPassword,
  recordSecurityEvent,
  detectSQLi,
  detectXSS,
} from '@/lib/security';
import { checkRateLimit, RATE_LIMIT_RULES } from '@/lib/rate-limiter';
import { getTurnstileConfigurationStatus, verifyTurnstileToken } from '@/lib/turnstile';
import { hashOpaqueToken } from '@/lib/auth-tokens';

export const dynamic = 'force-dynamic';

class ResetTokenAlreadyConsumedError extends Error {}

const ResetSchema = z.object({
  token: z.string().trim().min(1, 'Token wajib diisi'),
  new_password: z
    .string()
    .min(8, 'Password baru minimal 8 karakter')
    .max(128)
    .regex(/[a-z]/, 'Password harus mengandung huruf kecil')
    .regex(/[A-Z]/, 'Password harus mengandung huruf besar')
    .regex(/[0-9]/, 'Password harus mengandung angka'),
  turnstile_token: z.string().trim().optional(),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'Unknown';
  const requestId = req.headers.get('x-request-id') || `req-${Date.now()}`;

  // 1. Rate limit
  const rateLimitResult = await checkRateLimit(ip, RATE_LIMIT_RULES.FORGOT_PASSWORD, {
    endpoint: '/api/auth/reset-password',
    method: 'POST',
    userAgent,
    requestId,
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests', message: 'Terlalu banyak percobaan. Harap tunggu beberapa saat.' },
      { status: 429 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad Request', message: 'Format data tidak valid' }, { status: 400 });
  }

  // 2. Attack Pattern Detection
  const rawString = JSON.stringify(body);
  if (detectSQLi(rawString) || detectXSS(rawString)) {
    await recordSecurityEvent({
      eventType: 'sql_injection_attempt',
      severity: 'high',
      ipAddress: ip,
      method: 'POST',
      endpoint: '/api/auth/reset-password',
      userAgent,
      payloadSnippet: 'token=[REDACTED]',
      statusCode: 400,
      description: 'Attack attempt in reset password endpoint',
      requestId,
    });
    return NextResponse.json({ error: 'Bad Request', message: 'Input tidak valid.' }, { status: 400 });
  }

  // 3. Schema Validation
  const normalizedBody = {
    token: body?.token,
    new_password: body?.new_password || body?.password,
    turnstile_token: body?.turnstile_token,
  };
  const parseResult = ResetSchema.safeParse(normalizedBody);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Validation Error', message: parseResult.error.errors[0]?.message || 'Data tidak valid' },
      { status: 422 }
    );
  }

  const { token, new_password, turnstile_token } = parseResult.data;

  // 4. Turnstile Verification
  const turnstileConfig = getTurnstileConfigurationStatus();
  if (turnstileConfig.misconfigured) {
    return NextResponse.json(
      { error: 'Service Unavailable', message: 'Verifikasi keamanan belum dikonfigurasi dengan benar.' },
      { status: 503 }
    );
  }
  if (turnstileConfig.enabled) {
    const verification = turnstile_token
      ? await verifyTurnstileToken(turnstile_token, ip, 'reset_password')
      : { success: false, errorCodes: ['missing-input'] };

    if (!verification.success) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Verifikasi anti-bot gagal. Muat ulang halaman.' },
        { status: 403 }
      );
    }
  }

  try {
    const tokenHash = hashOpaqueToken(token.trim());
    const resetRecord = await prisma.passwordResetToken.findUnique({
      where: { token: tokenHash },
      include: { user: true },
    });

    if (!resetRecord || resetRecord.usedAt !== null) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Tautan reset kata sandi tidak valid atau telah digunakan sebelumnya.' },
        { status: 400 }
      );
    }

    if (resetRecord.expiresAt < new Date()) {
      await prisma.passwordResetToken.deleteMany({ where: { id: resetRecord.id } });
      return NextResponse.json(
        { error: 'Gone', message: 'Tautan reset kata sandi telah kedaluwarsa. Silakan minta tautan baru.' },
        { status: 410 }
      );
    }

    // Hash new password and increment session version to logout all active sessions
    const passwordHash = await hashPassword(new_password);

    await prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.updateMany({
        where: {
          id: resetRecord.id,
          usedAt: null,
          expiresAt: { gte: new Date() },
        },
        data: { usedAt: new Date() },
      });

      if (consumed.count !== 1) {
        throw new ResetTokenAlreadyConsumedError();
      }

      await tx.user.update({
        where: { id: resetRecord.userId },
        data: {
          passwordHash,
          sessionVersion: { increment: 1 },
        },
      });

      await tx.passwordResetToken.deleteMany({
        where: {
          userId: resetRecord.userId,
          id: { not: resetRecord.id },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: resetRecord.userId,
          action: 'USER_PASSWORD_RESET_SUCCESS',
          entityType: 'users',
          entityId: resetRecord.userId,
          ipAddress: ip,
          userAgent,
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: 'Kata sandi berhasil diperbarui! Seluruh sesi lama telah dinonaktifkan. Silakan login kembali.',
    });
  } catch (error) {
    if (error instanceof ResetTokenAlreadyConsumedError) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Tautan reset kata sandi sudah digunakan atau kedaluwarsa.' },
        { status: 400 }
      );
    }
    console.error('Reset password error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Gagal memperbarui kata sandi.' },
      { status: 500 }
    );
  }
}
