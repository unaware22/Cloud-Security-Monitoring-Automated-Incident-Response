import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import {
  getClientIp,
  verifyPassword,
  recordSecurityEvent,
  detectSQLi,
  detectXSS,
} from '@/lib/security';
import { checkRateLimit, RATE_LIMIT_RULES, resetRateLimit } from '@/lib/rate-limiter';
import { createUserToken, CUSTOMER_COOKIE_NAME } from '@/lib/user-auth';
import { getTurnstileConfigurationStatus, verifyTurnstileToken } from '@/lib/turnstile';
import { createAccountReference } from '@/lib/account-reference';
import {
  assessSuccessfulLogin,
  recordCredentialFailure,
} from '@/lib/credential-stuffing-detector';

export const dynamic = 'force-dynamic';

const LoginSchema = z.object({
  email: z.string().trim().email('Format email tidak valid').max(150),
  password: z.string().min(1, 'Password wajib diisi'),
  turnstile_token: z.string().trim().optional(),
});

// Comparing against a valid dummy hash makes unknown-email responses closer
// in timing to wrong-password responses and reduces account enumeration risk.
const DUMMY_PASSWORD_HASH = '$2a$10$sKLfFdwSmimKEhbKa9l4D.ZuVW8K3WffAwcjwgO06D02hu2lmCZTy';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'Unknown';
  const requestId = req.headers.get('x-request-id') || `req-${Date.now()}`;

  // 1. Rate Limit
  const rateLimitResult = await checkRateLimit(ip, RATE_LIMIT_RULES.USER_LOGIN, {
    endpoint: '/api/auth/login',
    method: 'POST',
    userAgent,
    requestId,
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests', message: 'Terlalu banyak percobaan login yang gagal. Silakan coba lagi nanti.' },
      { status: 429 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Bad Request', message: 'Format JSON tidak valid' },
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
      endpoint: '/api/auth/login',
      userAgent,
      payloadSnippet: 'login_input_rejected=attack_pattern',
      statusCode: 400,
      description: `Attack attempt in customer login form (${eventType})`,
      requestId,
    });

    return NextResponse.json(
      { error: 'Bad Request', message: 'Karakter terlarang terdeteksi pada form input.' },
      { status: 400 }
    );
  }

  // 3. Schema Validation
  const parseResult = LoginSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Validation Error', message: parseResult.error.errors[0]?.message || 'Data tidak valid' },
      { status: 422 }
    );
  }

  const { email, password, turnstile_token } = parseResult.data;
  const normalizedEmail = email.toLowerCase();
  let accountRef: string;
  try {
    accountRef = createAccountReference(normalizedEmail);
  } catch (error) {
    console.error('Customer login account-reference configuration error:', error);
    return NextResponse.json(
      { error: 'Service Unavailable', message: 'Layanan autentikasi belum siap. Silakan coba kembali.' },
      { status: 503 }
    );
  }

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
      ? await verifyTurnstileToken(turnstile_token, ip, 'login')
      : { success: false, errorCodes: ['missing-input'] };

    if (!verification.success) {
      await recordSecurityEvent({
        eventType: 'user_login_bot_attempt',
        severity: 'medium',
        ipAddress: ip,
        method: 'POST',
        endpoint: '/api/auth/login',
        userAgent,
        payloadSnippet: `turnstile_errors=${verification.errorCodes.join(',')}`,
        statusCode: 403,
        description: 'Customer login failed Turnstile verification',
        requestId,
        accountRef,
        authMethod: 'password',
      });

      return NextResponse.json(
        { error: 'Forbidden', message: 'Verifikasi anti-bot gagal atau kedaluwarsa. Silakan muat ulang halaman.' },
        { status: 403 }
      );
    }
  }

  const rejectInvalidCredentials = async (reason: string) => {
    const detection = recordCredentialFailure(ip, accountRef);

    await recordSecurityEvent({
      eventType: 'user_login_failed',
      severity: 'medium',
      ipAddress: ip,
      method: 'POST',
      endpoint: '/api/auth/login',
      userAgent,
      payloadSnippet: `reason=${reason}`,
      statusCode: 401,
      description: 'Failed customer login attempt: invalid credentials',
      requestId,
      accountRef,
      authMethod: 'password',
    });

    if (detection.credentialStuffingDetected) {
      await recordSecurityEvent({
        eventType: 'credential_stuffing_attempt',
        severity: 'critical',
        ipAddress: ip,
        method: 'POST',
        endpoint: '/api/auth/login',
        userAgent,
        payloadSnippet: `distinct_accounts=${detection.distinctAccountCount}; window_minutes=10`,
        statusCode: 429,
        description: 'Credential stuffing detected: one source targeted multiple customer accounts',
        requestId,
        accountRef,
        authMethod: 'password',
      });
    }

    if (detection.accountTakeoverDetected) {
      await recordSecurityEvent({
        eventType: 'account_takeover_attempt',
        severity: 'critical',
        ipAddress: ip,
        method: 'POST',
        endpoint: '/api/auth/login',
        userAgent,
        payloadSnippet: `distinct_source_ips=${detection.distinctIpCount}; window_minutes=10`,
        statusCode: 401,
        description: 'Possible account takeover: one customer account targeted by multiple sources',
        requestId,
        accountRef,
        authMethod: 'password',
      });
    }

    const shouldThrottle = detection.credentialStuffingDetected;
    return NextResponse.json(
      {
        error: shouldThrottle ? 'Too Many Requests' : 'Unauthorized',
        message: shouldThrottle
          ? 'Terlalu banyak percobaan login. Silakan coba lagi nanti.'
          : 'Email atau password salah.',
      },
      { status: shouldThrottle ? 429 : 401 }
    );
  };

  try {
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // If user not found
    if (!user) {
      await verifyPassword(password, DUMMY_PASSWORD_HASH);
      return rejectInvalidCredentials('invalid_credentials');
    }

    // If account was created purely via Google without a password
    if (!user.passwordHash) {
      await verifyPassword(password, DUMMY_PASSWORD_HASH);
      return rejectInvalidCredentials('invalid_credentials');
    }

    // Verify Password
    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      return rejectInvalidCredentials('invalid_credentials');
    }

    // A correct password ends the consecutive-failure window even if the
    // account still needs to complete email verification.
    resetRateLimit(ip, RATE_LIMIT_RULES.USER_LOGIN);

    // Require email verification before allowing access to user account/dashboard
    if (!user.isEmailVerified) {
      return NextResponse.json(
        {
          error: 'Forbidden',
          code: 'EMAIL_NOT_VERIFIED',
          message: 'Email akun Anda belum diverifikasi. Silakan periksa kotak masuk email Anda atau kirim ulang tautan verifikasi (berlaku 5 menit) sebelum masuk.',
          email: user.email,
        },
        { status: 403 }
      );
    }

    const successAssessment = assessSuccessfulLogin(ip, accountRef);
    if (successAssessment.suspicious) {
      await recordSecurityEvent({
        eventType: 'suspicious_login_success',
        severity: 'critical',
        ipAddress: ip,
        method: 'POST',
        endpoint: '/api/auth/login',
        userAgent,
        payloadSnippet: `distinct_accounts=${successAssessment.distinctAccountCount}; distinct_source_ips=${successAssessment.distinctIpCount}`,
        statusCode: 200,
        description: 'Successful login followed recent suspicious credential activity',
        requestId,
        accountRef,
        authMethod: 'password',
      });
    }

    // Update Last Login and Audit Log
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'USER_LOGIN_SUCCESS',
          entityType: 'users',
          entityId: user.id,
          ipAddress: ip,
          userAgent,
        },
      });
    } catch {}

    // Issue Session Token
    const token = await createUserToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: 'customer',
      sessionVersion: user.sessionVersion,
    });

    const response = NextResponse.json({
      success: true,
      message: 'Login berhasil!',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        isEmailVerified: user.isEmailVerified,
      },
    });

    response.cookies.set({
      name: CUSTOMER_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure:
        req.headers.get('x-forwarded-proto') === 'https' ||
        req.nextUrl.protocol === 'https:',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 3600, // 7 days
    });

    return response;
  } catch (error: any) {
    console.error('Customer login error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Terjadi kesalahan sistem saat login.' },
      { status: 500 }
    );
  }
}
