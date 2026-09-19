import { NextRequest, NextResponse } from 'next/server';
import { getCustomerSession } from '@/lib/user-auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getCustomerSession(req);
  if (!session) {
    return NextResponse.json({ success: false, authenticated: false, user: null }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isEmailVerified: true,
        googleId: true,
        authProvider: true,
        avatarUrl: true,
        passwordHash: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ success: false, authenticated: false, user: null });
    }

    const { passwordHash, ...safeUser } = user;

    return NextResponse.json({
      success: true,
      authenticated: true,
      user: {
        ...safeUser,
        hasGoogleLinked: Boolean(user.googleId),
        hasPassword: Boolean(passwordHash),
      },
    });
  } catch (error) {
    console.error('Error in /api/auth/me:', error);
    return NextResponse.json({ success: false, authenticated: false, user: null });
  }
}
