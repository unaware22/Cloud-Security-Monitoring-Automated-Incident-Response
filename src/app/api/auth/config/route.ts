import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rawClientId =
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    process.env.GOOGLE_CLIENT_ID ||
    '';

  const googleClientId =
    rawClientId && !rawClientId.includes('REPLACE_ME') ? rawClientId.trim() : '';

  return NextResponse.json({
    googleClientId,
  });
}
