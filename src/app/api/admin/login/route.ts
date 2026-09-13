import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import {
  getClientIp,
  verifyPassword,
  recordSecurityEvent,
  detectSQLi,
} from '@/lib/security';
import { checkRateLimit, RATE_LIMIT_RULES } from '@/lib/rate-limiter';
import { createAdminToken, COOKIE_NAME, getSessionTtlSeconds } from '@/lib/auth';
import { getTurnstileConfigurationStatus, verifyTurnstileToken } from '@/lib/turnstile';

export const dynamic = 'force-dynamic';

const LoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
  turnstile_token: z.string().trim().min(1).max(2048).optional(),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'Unknown';
  const requestId = req.headers.get('x-request-id') || `req-${Date.now()}`;

  // 1. Rate Limit: 5 attempts per 15 minutes
  const rateLimitResult = await checkRateLimit(ip, RATE_LIMIT_RULES.ADMIN_LOGIN, {
    endpoint: '/api/admin/login',
    method: 'POST',
    userAgent,
    requestId,
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      {
        error: 'Too Many Requests',
        message: 'Too many failed login attempts. Please try again later.',
      },
      { status: 429 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Bad Request', message: 'Malformed JSON' },
      { status: 400 }
    );
  }

  const rawString = JSON.stringify(body);
  if (detectSQLi(rawString)) {
    await recordSecurityEvent({
      eventType: 'sql_injection_attempt',
      severity: 'critical',
      ipAddress: ip,
      method: 'POST',
      endpoint: '/api/admin/login',
      userAgent,
      payloadSnippet: `email=${body?.email || ''}`,
      statusCode: 400,
      description: 'SQL Injection detected in admin login form',
      requestId,
    });

    return NextResponse.json(
      { error: 'Bad Request', message: 'Invalid credentials format' },
      { status: 400 }
    );
  }

  const parseResult = LoginSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Invalid email or password' },
      { status: 401 }
    );
  }

  const { email, password, turnstile_token } = parseResult.data;

  const turnstileConfiguration = getTurnstileConfigurationStatus();
  if (turnstileConfiguration.misconfigured) {
    console.error('[Admin Login] Turnstile site key and secret key must both be configured');
    return NextResponse.json(
      { error: 'Service Unavailable', message: 'Verifikasi keamanan admin belum dikonfigurasi dengan benar.' },
      { status: 503 }
    );
  }

  if (turnstileConfiguration.enabled) {
    const verification = turnstile_token
      ? await verifyTurnstileToken(turnstile_token, ip, 'admin_login')
      : { success: false, errorCodes: ['missing-input'] };

    if (!verification.success) {
      await recordSecurityEvent({
        eventType: 'admin_login_bot_attempt',
        severity: 'high',
        ipAddress: ip,
        method: 'POST',
        endpoint: '/api/admin/login',
        userAgent,
        payloadSnippet: `turnstile_errors=${verification.errorCodes.join(',') || 'unknown'}`,
        statusCode: 403,
        description: 'Admin login rejected by Cloudflare Turnstile verification',
        requestId,
      });

      return NextResponse.json(
        { error: 'Forbidden', message: 'Verifikasi keamanan gagal atau sudah kedaluwarsa.' },
        { status: 403 }
      );
    }
  }

  try {
    let admin = null;
    try {
      admin = await prisma.adminUser.findUnique({
        where: { email: email.toLowerCase() },
      });
    } catch (dbErr) {
      console.error('[Admin Login] Database connection unavailable');
      return NextResponse.json(
        { error: 'Service Unavailable', message: 'Layanan autentikasi sedang tidak tersedia.' },
        { status: 503 }
      );
    }

    // 1. If user is in DB
    if (admin) {
      if (!admin.isActive) {
        await recordSecurityEvent({
          eventType: 'admin_bruteforce_attempt',
          severity: 'high',
          ipAddress: ip,
          method: 'POST',
          endpoint: '/api/admin/login',
          userAgent,
          payloadSnippet: `email=${email}`,
          statusCode: 401,
          description: 'Failed admin login: user not active',
          requestId,
        });

        return NextResponse.json(
          { error: 'Unauthorized', message: 'Invalid email or password' },
          { status: 401 }
        );
      }

      const isPasswordValid = await verifyPassword(password, admin.passwordHash);
      if (!isPasswordValid) {
        await recordSecurityEvent({
          eventType: 'admin_bruteforce_attempt',
          severity: 'high',
          ipAddress: ip,
          method: 'POST',
          endpoint: '/api/admin/login',
          userAgent,
          payloadSnippet: `email=${email}`,
          statusCode: 401,
          description: 'Failed admin login: incorrect password',
          requestId,
        });

        return NextResponse.json(
          { error: 'Unauthorized', message: 'Invalid email or password' },
          { status: 401 }
        );
      }

      // Update last login and audit log if DB is available
      try {
        await prisma.adminUser.update({
          where: { id: admin.id },
          data: { lastLoginAt: new Date() },
        });

        await prisma.auditLog.create({
          data: {
            adminId: admin.id,
            action: 'ADMIN_LOGIN_SUCCESS',
            entityType: 'admin_users',
            entityId: admin.id,
            ipAddress: ip,
            userAgent,
          },
        });
      } catch {}

      const token = await createAdminToken({
        userId: admin.id,
        email: admin.email,
        role: admin.role,
        sessionVersion: admin.sessionVersion,
      });

      const response = NextResponse.json({
        success: true,
        data: {
          id: admin.id,
          email: admin.email,
          role: admin.role,
        },
      });

      response.cookies.set({
        name: COOKIE_NAME,
        value: token,
        httpOnly: true,
        // A Secure cookie is required over HTTPS, but browsers reject it on
        // the HTTP-only LAN address used by the homelab. Inspect the request
        // scheme instead of relying solely on NODE_ENV so the same image
        // works on the homelab and behind an HTTPS AWS load balancer.
        secure:
          req.headers.get('x-forwarded-proto') === 'https' ||
          req.nextUrl.protocol === 'https:',
        sameSite: 'lax',
        path: '/',
        maxAge: getSessionTtlSeconds(),
      });

      return response;
    }

    // Invalid credentials. Admin accounts must exist in PostgreSQL; there is no
    // source-code credential fallback in any deployed environment.
    await recordSecurityEvent({
      eventType: 'admin_bruteforce_attempt',
      severity: 'high',
      ipAddress: ip,
      method: 'POST',
      endpoint: '/api/admin/login',
      userAgent,
      payloadSnippet: `email=${email}`,
      statusCode: 401,
      description: 'Failed admin login: user not found or incorrect password',
      requestId,
    });

    return NextResponse.json(
      { error: 'Unauthorized', message: 'Invalid email or password' },
      { status: 401 }
    );
  } catch (error) {
    console.error('Admin login error:', error);
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Invalid email or password' },
      { status: 401 }
    );
  }
}
