import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCustomerSession } from '@/lib/user-auth';
import { getClientIp } from '@/lib/security';
import { checkRateLimit, RATE_LIMIT_RULES } from '@/lib/rate-limiter';
import { sendEmailVerificationLink } from '@/lib/email';
import { generateOpaqueToken } from '@/lib/auth-tokens';
import { waitForResponseFloor } from '@/lib/response-timing';

export const dynamic = 'force-dynamic';

// One answer for unknown, already verified and unverified emails, so this
// endpoint cannot be used to test which emails have an account (or whether
// it is verified). Only an unverified account actually receives a new link.
const GENERIC_MESSAGE =
  'Jika email terdaftar dan belum terverifikasi, tautan verifikasi baru (berlaku 5 menit) telah dikirimkan.';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'Unknown';
  const requestId = req.headers.get('x-request-id') || `req-${Date.now()}`;

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

  // 1. Rate Limit: Max 5x, then 10 minute cooldown
  const rateLimitKey = `${ip}:${targetEmail}`;
  const rateLimitResult = await checkRateLimit(rateLimitKey, RATE_LIMIT_RULES.RESEND_VERIFICATION, {
    endpoint: '/api/auth/resend-verification',
    method: 'POST',
    userAgent,
    requestId,
  });

  if (!rateLimitResult.allowed) {
    const minutesLeft = Math.max(1, Math.ceil((rateLimitResult.resetTime - Date.now()) / 60000));
    return NextResponse.json(
      {
        error: 'Too Many Requests',
        message: `Batas permintaan kode/tautan verifikasi tercapai (maksimal 5x). Demi keamanan dari serangan spam, silakan tunggu jeda ${minutesLeft} menit.`,
      },
      { status: 429 }
    );
  }

  const startedAt = Date.now();
  try {
    const user = await prisma.user.findUnique({
      where: { email: targetEmail },
    });

    if (user && !user.isEmailVerified) {
      // Delete old tokens and generate new
      await prisma.emailVerificationToken.deleteMany({
        where: { userId: user.id },
      });

      const { token, tokenHash } = generateOpaqueToken();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 menit

      await prisma.emailVerificationToken.create({
        data: {
          userId: user.id,
          token: tokenHash,
          expiresAt,
        },
      });

      sendEmailVerificationLink({
        email: user.email,
        name: user.name,
        token,
      }).catch((err) => console.error('[Resend Verification] Email dispatch error:', err));
    }

    await waitForResponseFloor(startedAt);
    return NextResponse.json({ success: true, message: GENERIC_MESSAGE });
  } catch (error) {
    console.error('Resend verification error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Gagal mengirim ulang email verifikasi.' },
      { status: 500 }
    );
  }
}
