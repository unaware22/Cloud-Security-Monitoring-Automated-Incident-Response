import { NextRequest, NextResponse } from 'next/server';
import { getActivePenalty, recordPenaltyHit } from '@/lib/device-ban';

export const dynamic = 'force-dynamic';

// Called only by the Edge middleware (which cannot use Prisma). Protected by
// the same shared token as the security-log relay.
export async function GET(req: NextRequest) {
  const expectedToken = process.env.SECURITY_EVENT_RELAY_TOKEN;
  const suppliedToken = req.headers.get('x-security-event-token');
  if (!expectedToken || expectedToken.length < 32 || suppliedToken !== expectedToken) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  const deviceId = req.nextUrl.searchParams.get('device');
  const ip = req.nextUrl.searchParams.get('ip') || 'unknown';
  if (!deviceId) return NextResponse.json({ banned: false });

  const penalty = await getActivePenalty('device', deviceId);
  if (!penalty) return NextResponse.json({ banned: false });

  await recordPenaltyHit(penalty.id, ip);
  return NextResponse.json({
    banned: true,
    expiresAt: penalty.expiresAt.toISOString(),
    deviceRef: penalty.subjectRef,
  });
}
