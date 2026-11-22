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
import { createUserToken, CUSTOMER_COOKIE_NAME } from '@/lib/user-auth';
import { getTurnstileConfigurationStatus, verifyTurnstileToken } from '@/lib/turnstile';
import { sendEmailVerificationLink, sendExistingAccountRegistrationNotice } from '@/lib/email';
import { generateOpaqueToken } from '@/lib/auth-tokens';
import { createAccountReference } from '@/lib/account-reference';
import { waitForResponseFloor } from '@/lib/response-timing';

export const dynamic = 'force-dynamic';

const RegisterSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(100),
  email: z.string().trim().email('Format email tidak valid').max(150),
  password: z
    .string()
    .min(8, 'Password minimal 8 karakter')
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

  // 1. Rate Limit
  const rateLimitResult = await checkRateLimit(ip, RATE_LIMIT_RULES.USER_REGISTER, {
    endpoint: '/api/auth/register',
    method: 'POST',
    userAgent,
    requestId,
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests', message: 'Terlalu banyak percobaan registrasi. Harap coba lagi nanti.' },
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

  // 2. Attack Pattern Detection
  const securityPayload = { ...body, turnstile_token: '[REDACTED]' };
  const rawString = JSON.stringify(securityPayload);
  if (detectSQLi(rawString) || detectXSS(rawString)) {
    const eventType = detectSQLi(rawString) ? 'sql_injection_attempt' : 'xss_attempt';
    await recordSecurityEvent({
      eventType,
      severity: 'high',
      ipAddress: ip,
      method: 'POST',
      endpoint: '/api/auth/register',
      userAgent,
      payloadSnippet: `email=${body?.email || ''}`,
      statusCode: 400,
      description: `Attack attempt in customer register form (${eventType})`,
      requestId,
    });

    return NextResponse.json(
      { error: 'Bad Request', message: 'Karakter terlarang terdeteksi pada form input.' },
      { status: 400 }
    );
  }

  // 3. Schema Validation
  const parseResult = RegisterSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Validation Error', message: parseResult.error.errors[0]?.message || 'Data tidak valid' },
      { status: 422 }
    );
  }

  const { name, email, password, turnstile_token } = parseResult.data;
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
      ? await verifyTurnstileToken(turnstile_token, ip, 'register')
      : { success: false, errorCodes: ['missing-input'] };

    if (!verification.success) {
      await recordSecurityEvent({
        eventType: 'user_registration_bot_attempt',
        severity: 'medium',
        ipAddress: ip,
        method: 'POST',
        endpoint: '/api/auth/register',
        userAgent,
        payloadSnippet: `email=${normalizedEmail}; error=${verification.errorCodes.join(',')}`,
        statusCode: 403,
        description: 'Customer registration failed Turnstile anti-bot verification',
        requestId,
      });

      return NextResponse.json(
        { error: 'Forbidden', message: 'Verifikasi anti-bot gagal atau kedaluwarsa. Silakan muat ulang halaman.' },
        { status: 403 }
      );
    }
  }

  // From here on a registered email and a new one get the same answer in
  // about the same time, so this page cannot be used to test which emails
  // have an account. The real owner of an existing account is told by email.
  const startedAt = Date.now();
  const registrationAccepted = () =>
    NextResponse.json({
      success: true,
      requiresVerification: true,
      message: 'Registrasi berhasil! Tautan verifikasi telah dikirim ke email Anda. Silakan verifikasi email Anda dalam 5 menit sebelum masuk.',
    });

  try {
    // 5. Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      // Same bcrypt cost as a real registration, so timing stays similar.
      await hashPassword(password);

      if (existingUser.isEmailVerified) {
        sendExistingAccountRegistrationNotice({
          email: existingUser.email,
          name: existingUser.name,
        }).catch((err) => console.error('[Register] Existing-account notice error:', err));
      } else {
        // Registered before but never verified: send a fresh verification
        // link to the inbox owner instead of creating a second account.
        const { token, tokenHash } = generateOpaqueToken();
        await prisma.emailVerificationToken.deleteMany({ where: { userId: existingUser.id } });
        await prisma.emailVerificationToken.create({
          data: { userId: existingUser.id, token: tokenHash, expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
        });
        sendEmailVerificationLink({
          email: existingUser.email,
          name: existingUser.name,
          token,
        }).catch((err) => console.error('[Register] Email send error:', err));
      }

      let accountRef: string | undefined;
      try {
        accountRef = createAccountReference(normalizedEmail);
      } catch {}
      await recordSecurityEvent({
        eventType: 'registration_existing_email',
        severity: 'low',
        ipAddress: ip,
        method: 'POST',
        endpoint: '/api/auth/register',
        userAgent,
        payloadSnippet: `existing_account_verified=${existingUser.isEmailVerified}`,
        statusCode: 200,
        description: 'Registration attempted with an email that already has an account',
        requestId,
        accountRef,
      });

      await waitForResponseFloor(startedAt);
      return registrationAccepted();
    }

    // 6. Create User and Verification Token
    const passwordHash = await hashPassword(password);
    const { token: verificationToken, tokenHash } = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 menit

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email: normalizedEmail,
          passwordHash,
          role: 'customer',
          isEmailVerified: false,
          sessionVersion: 0,
          authProvider: 'local',
        },
      });

      await tx.emailVerificationToken.create({
        data: {
          userId: user.id,
          token: tokenHash,
          expiresAt,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'USER_REGISTER_SUCCESS',
          entityType: 'users',
          entityId: user.id,
          ipAddress: ip,
          userAgent,
        },
      });

      return user;
    });

    // 7. Dispatch Email Verification (Asynchronous, non-blocking for fast UI response)
    sendEmailVerificationLink({
      email: normalizedEmail,
      name,
      token: verificationToken,
    }).catch((err) => console.error('[Register] Email send error:', err));

    // 8. Same response as for an existing email, without a session cookie
    // (the user must verify first) and without account details.
    await waitForResponseFloor(startedAt);
    return registrationAccepted();
  } catch (error: any) {
    console.error('Customer registration error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Terjadi kesalahan sistem saat registrasi.' },
      { status: 500 }
    );
  }
}
