import { NextRequest, NextResponse } from 'next/server';
import { CUSTOMER_COOKIE_NAME } from '@/lib/user-auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const response = NextResponse.json({
    success: true,
    message: 'Logout berhasil.',
  });

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
}
