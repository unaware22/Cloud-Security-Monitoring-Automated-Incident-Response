import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyGoogleIdToken, createUserToken, CUSTOMER_COOKIE_NAME } from '@/lib/user-auth';
import { getClientIp, verifyPassword, recordSecurityEvent } from '@/lib/security';
import { checkRateLimit, RATE_LIMIT_RULES, resetRateLimit } from '@/lib/rate-limiter';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'Unknown';
  const requestId = req.headers.get('x-request-id') || `req-${Date.now()}`;

  // 1. Rate Limit
  const rateLimitResult = await checkRateLimit(ip, RATE_LIMIT_RULES.USER_LOGIN, {
    endpoint: '/api/auth/google/link-account',
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

  const id_token = body?.google_id_token || body?.id_token || body?.credential;
  const password = body?.password;
  if (!id_token || !password) {
    return NextResponse.json(
      { error: 'Bad Request', message: 'Google Token dan Password akun wajib disertakan untuk konfirmasi kepemilikan.' },
      { status: 400 }
    );
  }

  try {
    // 2. Cryptographically verify Google ID Token
    const googleUser = await verifyGoogleIdToken(id_token);
    const { sub, email, picture } = googleUser;

    // 3. Find existing account
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Akun dengan email tersebut tidak ditemukan.' },
        { status: 404 }
      );
    }

    if (!user.passwordHash) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Akun ini tidak memiliki password lokal.' },
        { status: 400 }
      );
    }

    // 4. Verify Password as Proof of Account Ownership
    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      await recordSecurityEvent({
        eventType: 'user_login_failed',
        severity: 'high',
        ipAddress: ip,
        method: 'POST',
        endpoint: '/api/auth/google/link-account',
        userAgent,
        payloadSnippet: `email=${email}; reason=incorrect_password_for_google_link`,
        statusCode: 401,
        description: 'Failed account linking: incorrect password provided',
        requestId,
      });

      return NextResponse.json(
        { error: 'Unauthorized', message: 'Kata sandi salah. Pembuktian kepemilikan akun gagal.' },
        { status: 401 }
      );
    }

    // 5. Link Google sub ID to user account
    const updatedUser = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: user.id },
        data: {
          googleId: sub,
          authProvider: 'both',
          isEmailVerified: true,
          emailVerifiedAt: user.emailVerifiedAt || new Date(),
          avatarUrl: picture || user.avatarUrl,
          lastLoginAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'USER_GOOGLE_ACCOUNT_LINKED',
          entityType: 'users',
          entityId: user.id,
          oldValue: JSON.stringify({ googleId: null }),
          newValue: JSON.stringify({ googleId: sub }),
          ipAddress: ip,
          userAgent,
        },
      });

      // Google has verified the email and account ownership was proven with
      // the local password. Any outstanding email-verification links must no
      // longer remain usable.
      await tx.emailVerificationToken.deleteMany({
        where: { userId: user.id },
      });

      return u;
    });

    // 6. Issue Session Token
    const token = await createUserToken({
      userId: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      role: 'customer',
      sessionVersion: updatedUser.sessionVersion,
    });

    resetRateLimit(ip, RATE_LIMIT_RULES.USER_LOGIN);

    const response = NextResponse.json({
      success: true,
      message: 'Akun Google berhasil ditautkan! Anda sekarang dapat login menggunakan Google maupun kata sandi.',
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        avatarUrl: updatedUser.avatarUrl,
        isEmailVerified: true,
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
      maxAge: 7 * 24 * 3600,
    });

    return response;
  } catch (error: any) {
    console.error('Google link account error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Gagal menautkan akun Google.' },
      { status: 500 }
    );
  }
}
