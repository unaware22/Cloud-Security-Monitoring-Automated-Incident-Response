import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSession } from '@/lib/auth';
import { liftPenalty } from '@/lib/device-ban';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const LiftSchema = z.object({ id: z.string().uuid() });

function hasValidOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0].trim();
  const requestHost = forwardedHost || req.headers.get('host');
  if (!requestHost) return false;
  try {
    return new URL(origin).host === requestHost;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const [history, activeCount, hitsAgg] = await Promise.all([
    prisma.securityPenalty.findMany({ take: 100, orderBy: { createdAt: 'desc' } }),
    prisma.securityPenalty.count({
      where: { liftedAt: null, expiresAt: { gt: now } },
    }),
    prisma.securityPenalty.aggregate({
      where: { createdAt: { gt: new Date(Date.now() - 24 * 3600 * 1000) } },
      _sum: { hitCount: true },
    }),
  ]);

  const active = history.filter((p) => !p.liftedAt && p.expiresAt > now);

  return NextResponse.json({
    success: true,
    data: {
      active,
      history,
      summary: {
        active: activeCount,
        blocked_requests_24h: hitsAgg._sum.hitCount ?? 0,
        // Same device banned again after its first ban: strong sign of IP/VPN evasion.
        repeat_offenders: history.filter((p) => p.strike >= 2).length,
      },
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasValidOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = LiftSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Bad Request', message: 'ID tidak valid' }, { status: 400 });
  }

  const lifted = await liftPenalty(parsed.data.id, session.email);
  if (!lifted) {
    return NextResponse.json(
      { error: 'Not Found', message: 'Pembatasan tidak ditemukan atau sudah berakhir.' },
      { status: 404 }
    );
  }
  return NextResponse.json({ success: true, message: 'Pembatasan dibuka.' });
}
