import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import {
  getClientIp,
  recordSecurityEvent,
  detectSQLi,
  detectXSS,
} from '@/lib/security';
import { checkRateLimit, RATE_LIMIT_RULES } from '@/lib/rate-limiter';
import { getTurnstileConfigurationStatus, verifyTurnstileToken } from '@/lib/turnstile';
import { sendPasswordResetLink } from '@/lib/email';
import { generateOpaqueToken } from '@/lib/auth-tokens';

export const dynamic = 'force-dynamic';

const ForgotSchema = z.object({
  email: z.string().trim().email('Format email tidak valid').max(150),
  turnstile_token: z.string().trim().optional(),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'Unknown';
  const requestId = req.headers.get('x-request-id') || `req-${Date.now()}`;

  // 1. Rate Limit
  const rateLimitResult = await checkRateLimit(ip, RATE_LIMIT_RULES.FORGOT_PASSWORD, {
    endpoint: '/api/auth/forgot-password',
    method: 'POST',
    userAgent,
    requestId,
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests', message: 'Terlalu banyak permintaan reset kata sandi. Harap coba lagi nanti.' },
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
      endpoint: '/api/auth/forgot-password',
      userAgent,
      payloadSnippet: `email=${body?.email || ''}`,
      statusCode: 400,
      description: 'Attack attempt in forgot password endpoint',
      requestId,
    });
    return NextResponse.json({ error: 'Bad Request', message: 'Input tidak valid.' }, { status: 400 });
  }

  // 3. Schema Validation
  const parseResult = ForgotSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Validation Error', message: parseResult.error.errors[0]?.message || 'Email tidak valid' },
      { status: 422 }
    );
  }

  const { email, turnstile_token } = parseResult.data;
  const normalizedEmail = email.toLowerCase();

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
      ? await verifyTurnstileToken(turnstile_token, ip, 'forgot_password')
      : { success: false, errorCodes: ['missing-input'] };

    if (!verification.success) {
      await recordSecurityEvent({
        eventType: 'user_login_bot_attempt',
        severity: 'medium',
        ipAddress: ip,
        method: 'POST',
        endpoint: '/api/auth/forgot-password',
        userAgent,
        payloadSnippet: `email=${normalizedEmail}; error=${verification.errorCodes.join(',')}`,
        statusCode: 403,
        description: 'Forgot password failed Turnstile verification',
        requestId,
      });

      return NextResponse.json(
        { error: 'Forbidden', message: 'Verifikasi anti-bot gagal. Muat ulang halaman.' },
        { status: 403 }
      );
    }
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (user) {
      // Invalidate existing unused tokens
      await prisma.passwordResetToken.deleteMany({
        where: { userId: user.id },
      });

      const { token, tokenHash } = generateOpaqueToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token: tokenHash,
          expiresAt,
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'USER_PASSWORD_RESET_REQUESTED',
          entityType: 'users',
          entityId: user.id,
          ipAddress: ip,
          userAgent,
        },
      });

      sendPasswordResetLink({
        email: user.email,
        name: user.name,
        token,
      }).catch((err) => console.error('[Forgot Password] Email send error:', err));
    }

    // Always respond with identical message to prevent user enumeration
    return NextResponse.json({
      success: true,
      message: 'Jika alamat email Anda terdaftar, kami telah mengirimkan tautan untuk mengatur ulang kata sandi ke kotak masuk Anda.',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Terjadi gangguan sistem saat memproses permintaan.' },
      { status: 500 }
    );
  }
}
