import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/security';
import { createUserToken, CUSTOMER_COOKIE_NAME } from '@/lib/user-auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'Unknown';

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const token = body.token || req.nextUrl.searchParams.get('token');

  if (!token || typeof token !== 'string') {
    return NextResponse.json(
      { error: 'Bad Request', message: 'Token verifikasi tidak valid atau tidak ditemukan.' },
      { status: 400 }
    );
  }

  try {
    const verification = await prisma.emailVerificationToken.findUnique({
      where: { token: token.trim() },
      include: { user: true },
    });

    if (!verification) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Tautan verifikasi tidak valid atau telah kedaluwarsa.' },
        { status: 404 }
      );
    }

    // If user is ALREADY verified (handles repeated clicks, scanners, or React StrictMode re-renders)
    if (verification.user.isEmailVerified) {
      const sessionToken = await createUserToken({
        userId: verification.user.id,
        email: verification.user.email,
        name: verification.user.name,
        role: 'customer',
        sessionVersion: verification.user.sessionVersion,
      });

      const res = NextResponse.json({
        success: true,
        alreadyVerified: true,
        message: 'Alamat email Anda telah berhasil diverifikasi. Akun Anda kini aktif sepenuhnya.',
        user: {
          id: verification.user.id,
          name: verification.user.name,
          email: verification.user.email,
        },
      });

      res.cookies.set({
        name: CUSTOMER_COOKIE_NAME,
        value: sessionToken,
        httpOnly: true,
        secure:
          req.headers.get('x-forwarded-proto') === 'https' ||
          req.nextUrl.protocol === 'https:',
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 3600,
      });

      return res;
    }

    // Check expiration (5 minutes) for unverified accounts
    if (verification.expiresAt < new Date()) {
      return NextResponse.json(
        {
          error: 'EXPIRED',
          message: 'Tautan verifikasi telah kedaluwarsa (berlaku maksimal 5 menit). Silakan minta tautan verifikasi baru.',
        },
        { status: 410 }
      );
    }

    // Mark user as verified
    const updatedUser = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: verification.userId },
        data: {
          isEmailVerified: true,
          emailVerifiedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          userId: verification.userId,
          action: 'USER_EMAIL_VERIFIED',
          entityType: 'users',
          entityId: verification.userId,
          ipAddress: ip,
          userAgent,
        },
      });

      return u;
    });

    // Auto-login the user into their session now that their email is verified!
    const sessionToken = await createUserToken({
      userId: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      role: 'customer',
      sessionVersion: updatedUser.sessionVersion,
    });

    const response = NextResponse.json({
      success: true,
      message: 'Selamat! Alamat email Anda telah berhasil diverifikasi. Akun Anda kini aktif.',
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
      },
    });

    response.cookies.set({
      name: CUSTOMER_COOKIE_NAME,
      value: sessionToken,
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
    console.error('Email verification error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Gagal memproses verifikasi email.' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
