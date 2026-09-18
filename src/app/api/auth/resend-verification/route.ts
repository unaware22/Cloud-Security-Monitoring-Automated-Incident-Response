import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { getCustomerSession } from '@/lib/user-auth';
import { getClientIp } from '@/lib/security';
import { checkRateLimit, RATE_LIMIT_RULES } from '@/lib/rate-limiter';
import { sendEmailVerificationLink } from '@/lib/email';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'Unknown';
  const requestId = req.headers.get('x-request-id') || `req-${Date.now()}`;

  // 1. Rate Limit
  const rateLimitResult = await checkRateLimit(ip, RATE_LIMIT_RULES.FORGOT_PASSWORD, {
    endpoint: '/api/auth/resend-verification',
    method: 'POST',
    userAgent,
    requestId,
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests', message: 'Harap tunggu beberapa saat sebelum meminta pengiriman ulang email.' },
      { status: 429 }
    );
  }

  // Check authenticated session or request body email
  const session = await getCustomerSession(req);
  let targetEmail = session?.email;

  if (!targetEmail) {
    try {
      const body = await req.json();
      targetEmail = body?.email?.trim().toLowerCase();
    } catch {}
  }

  if (!targetEmail) {
    return NextResponse.json(
      { error: 'Bad Request', message: 'Email tidak ditemukan.' },
      { status: 400 }
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: targetEmail },
    });

    if (!user) {
      return NextResponse.json({
        success: true,
        message: 'Jika email terdaftar, tautan verifikasi telah dikirimkan.',
      });
    }

    if (user.isEmailVerified) {
      return NextResponse.json({
        success: true,
        message: 'Email akun ini sudah terverifikasi.',
      });
    }

    // Delete old tokens and generate new
    await prisma.emailVerificationToken.deleteMany({
      where: { userId: user.id },
    });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 menit

    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    sendEmailVerificationLink({
      email: user.email,
      name: user.name,
      token,
    }).catch((err) => console.error('[Resend Verification] Email dispatch error:', err));

    return NextResponse.json({
      success: true,
      message: 'Tautan verifikasi baru berhasil dikirimkan ke email Anda.',
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Gagal mengirim ulang email verifikasi.' },
      { status: 500 }
    );
  }
}
