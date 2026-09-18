import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyGoogleIdToken, createUserToken, CUSTOMER_COOKIE_NAME } from '@/lib/user-auth';
import { getClientIp, recordSecurityEvent } from '@/lib/security';
import { checkRateLimit, RATE_LIMIT_RULES } from '@/lib/rate-limiter';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'Unknown';
  const requestId = req.headers.get('x-request-id') || `req-${Date.now()}`;

  // 1. Rate Limit
  const rateLimitResult = await checkRateLimit(ip, RATE_LIMIT_RULES.USER_LOGIN, {
    endpoint: '/api/auth/google',
    method: 'POST',
    userAgent,
    requestId,
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests', message: 'Terlalu banyak permintaan login Google. Harap coba lagi nanti.' },
      { status: 429 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad Request', message: 'Format data tidak valid' }, { status: 400 });
  }

  const idToken = body?.google_id_token || body?.id_token || body?.credential;
  if (!idToken || typeof idToken !== 'string') {
    return NextResponse.json(
      { error: 'Bad Request', message: 'Google ID Token wajib disertakan' },
      { status: 400 }
    );
  }

  let googleUser;
  try {
    // 2. Cryptographically verify Google ID Token and extract sub
    googleUser = await verifyGoogleIdToken(idToken);
  } catch (error: any) {
    console.error('Google token verification failed:', error.message);
    await recordSecurityEvent({
      eventType: 'user_login_bot_attempt',
      severity: 'medium',
      ipAddress: ip,
      method: 'POST',
      endpoint: '/api/auth/google',
      userAgent,
      payloadSnippet: `reason=invalid_google_token; err=${error.message}`,
      statusCode: 401,
      description: 'Invalid Google ID Token presented to /api/auth/google',
      requestId,
    });

    return NextResponse.json(
      { error: 'Unauthorized', message: 'Verifikasi identitas Google gagal. Silakan coba kembali.' },
      { status: 401 }
    );
  }

  const { sub, email, name, picture } = googleUser;

  try {
    // 3. Step 1: Check if user exists by permanent Google subject ID (sub)
    let user = await prisma.user.findUnique({
      where: { googleId: sub },
    });

    if (user) {
      // User is already linked with this sub ID. Login immediately.
      await prisma.user.update({
        where: { id: user.id },
        data: {
          lastLoginAt: new Date(),
          avatarUrl: picture || user.avatarUrl,
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'USER_GOOGLE_LOGIN_SUCCESS',
          entityType: 'users',
          entityId: user.id,
          ipAddress: ip,
          userAgent,
        },
      });

      const token = await createUserToken({
        userId: user.id,
        email: user.email,
        name: user.name,
        role: 'customer',
        sessionVersion: user.sessionVersion,
      });

      const response = NextResponse.json({
        success: true,
        message: 'Login Google berhasil!',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl,
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
        maxAge: 7 * 24 * 3600,
      });

      return response;
    }

    // 4. Step 2: If no account matched sub, check if email already exists
    const existingByEmail = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingByEmail) {
      // Sesuai requirement: "Jika email sudah terdaftar lewat password, akun jangan otomatis digabung tanpa pembuktian kepemilikan."
      return NextResponse.json(
        {
          error: 'ACCOUNT_EXISTS_REQUIRES_PASSWORD',
          requiresPasswordProof: true,
          message:
            'Alamat email Google ini sudah terdaftar menggunakan kata sandi lokal. Demi keamanan, silakan konfirmasi kata sandi akun Anda untuk menghubungkannya.',
          email: existingByEmail.email,
          googleSub: sub,
        },
        { status: 409 }
      );
    }

    // 5. Step 3: First time registration via Google
    user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        googleId: sub,
        authProvider: 'google',
        isEmailVerified: true, // Google already verified this email
        emailVerifiedAt: new Date(),
        avatarUrl: picture,
        sessionVersion: 0,
        lastLoginAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'USER_REGISTER_GOOGLE_SUCCESS',
        entityType: 'users',
        entityId: user.id,
        ipAddress: ip,
        userAgent,
      },
    });

    const token = await createUserToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: 'customer',
      sessionVersion: user.sessionVersion,
    });

    const response = NextResponse.json({
      success: true,
      message: 'Akun berhasil dibuat dengan Google!',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
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
    console.error('Google Auth Processing Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Gagal memproses autentikasi Google.' },
      { status: 500 }
    );
  }
}
