import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCustomerSession, CUSTOMER_COOKIE_NAME } from '@/lib/user-auth';
import { getClientIp } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getCustomerSession(req);
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Sesi tidak valid atau telah berakhir.' },
      { status: 401 }
    );
  }

  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'Unknown';

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: session.userId },
        data: {
          sessionVersion: { increment: 1 },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'USER_SESSIONS_REVOKED',
          entityType: 'users',
          entityId: session.userId,
          ipAddress: ip,
          userAgent,
        },
      });
    });

    const response = NextResponse.json({
      success: true,
      message: 'Berhasil keluar dari semua sesi di semua perangkat.',
    });

    // Clear local cookie
    response.cookies.set({
      name: CUSTOMER_COOKIE_NAME,
      value: '',
      httpOnly: true,
      secure:
        req.headers.get('x-forwarded-proto') === 'https' ||
        req.nextUrl.protocol === 'https:',
      sameSite: 'lax',
      path: '/',
      expires: new Date(0),
    });

    return response;
  } catch (error) {
    console.error('Logout all sessions error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Gagal memproses logout semua sesi.' },
      { status: 500 }
    );
  }
}
