import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { COOKIE_NAME, getAdminSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, RATE_LIMIT_RULES } from '@/lib/rate-limiter';
import {
  getClientIp,
  hashPassword,
  recordSecurityEvent,
  verifyPassword,
} from '@/lib/security';

export const dynamic = 'force-dynamic';

const PasswordSchema = z
  .object({
    current_password: z.string().min(1).max(128),
    new_password: z
      .string()
      .min(14, 'Password baru minimal 14 karakter')
      .max(128)
      .regex(/[a-z]/, 'Password baru harus mengandung huruf kecil')
      .regex(/[A-Z]/, 'Password baru harus mengandung huruf besar')
      .regex(/[0-9]/, 'Password baru harus mengandung angka')
      .regex(/[^A-Za-z0-9]/, 'Password baru harus mengandung simbol'),
  })
  .refine((data) => data.current_password !== data.new_password, {
    message: 'Password baru harus berbeda dari password saat ini',
    path: ['new_password'],
  });

function clearAdminCookie(response: NextResponse, req: NextRequest): void {
  response.cookies.set({
    name: COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure:
      req.headers.get('x-forwarded-proto') === 'https' ||
      req.nextUrl.protocol === 'https:',
    expires: new Date(0),
    path: '/',
  });
}

function hasValidOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;

  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0].trim();
  const requestHost = forwardedHost || req.headers.get('host');
  if (!requestHost) return false;

  try {
    return new URL(origin).host === requestHost;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Sesi admin tidak valid atau telah berakhir.' },
      { status: 401 }
    );
  }

  if (!hasValidOrigin(req)) {
    return NextResponse.json(
      { error: 'Forbidden', message: 'Permintaan lintas situs ditolak.' },
      { status: 403 }
    );
  }

  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'Unknown';
  const requestId = req.headers.get('x-request-id') || `req-${Date.now()}`;
  const rateLimit = await checkRateLimit(ip, RATE_LIMIT_RULES.ADMIN_SECURITY, {
    endpoint: '/api/admin/security/password',
    method: 'POST',
    userAgent,
    requestId,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests', message: 'Terlalu banyak percobaan. Coba lagi nanti.' },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Bad Request', message: 'Format permintaan tidak valid.' },
      { status: 400 }
    );
  }

  const parsed = PasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Bad Request',
        message: parsed.error.issues[0]?.message || 'Password baru tidak memenuhi ketentuan.',
      },
      { status: 400 }
    );
  }

  const admin = await prisma.adminUser.findUnique({
    where: { id: session.userId },
  });

  if (!admin || !admin.isActive || admin.sessionVersion !== session.sessionVersion) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Sesi admin tidak valid atau telah dicabut.' },
      { status: 401 }
    );
  }

  const currentPasswordIsValid = await verifyPassword(
    parsed.data.current_password,
    admin.passwordHash
  );

  if (!currentPasswordIsValid) {
    await recordSecurityEvent({
      eventType: 'unauthorized_admin_access',
      severity: 'high',
      ipAddress: ip,
      method: 'POST',
      endpoint: '/api/admin/security/password',
      userAgent,
      payloadSnippet: `admin_id=${admin.id}; reason=incorrect_current_password`,
      statusCode: 401,
      description: 'Admin password change rejected because the current password was incorrect',
      requestId,
    });

    return NextResponse.json(
      { error: 'Unauthorized', message: 'Password saat ini salah.' },
      { status: 401 }
    );
  }

  const passwordHash = await hashPassword(parsed.data.new_password);
  const nextSessionVersion = admin.sessionVersion + 1;

  await prisma.$transaction(async (tx) => {
    const updateResult = await tx.adminUser.updateMany({
      where: {
        id: admin.id,
        sessionVersion: admin.sessionVersion,
        isActive: true,
      },
      data: {
        passwordHash,
        sessionVersion: { increment: 1 },
      },
    });

    if (updateResult.count !== 1) {
      throw new Error('Admin session changed during password update');
    }

    await tx.auditLog.create({
      data: {
        adminId: admin.id,
        action: 'ADMIN_PASSWORD_CHANGED_AND_SESSIONS_REVOKED',
        entityType: 'admin_users',
        entityId: admin.id,
        oldValue: JSON.stringify({ sessionVersion: admin.sessionVersion }),
        newValue: JSON.stringify({ sessionVersion: nextSessionVersion }),
        ipAddress: ip,
        userAgent,
      },
    });
  });

  const response = NextResponse.json({
    success: true,
    message: 'Password berhasil diubah. Semua sesi admin lama telah dicabut.',
  });
  response.headers.set('Cache-Control', 'no-store');
  clearAdminCookie(response, req);
  return response;
}
