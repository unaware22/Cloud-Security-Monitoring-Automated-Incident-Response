import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const severity = searchParams.get('severity');
  const eventType = searchParams.get('event_type');
  const search = searchParams.get('search');
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 30));
  const skip = (page - 1) * limit;

  try {
    const where: any = {};

    if (severity && severity !== 'all') {
      where.severity = severity;
    }

    if (eventType && eventType !== 'all') {
      where.eventType = eventType;
    }

    if (search && search.trim()) {
      where.OR = [
        { ipAddress: { contains: search.trim() } },
        { endpoint: { contains: search.trim() } },
        { payloadSnippet: { contains: search.trim(), mode: 'insensitive' } },
        { description: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    const [events, total] = await Promise.all([
      prisma.securityEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.securityEvent.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      data: events,
    });
  } catch (error) {
    console.warn('[Admin Security Events] DB offline, returning empty fallback...');
    return NextResponse.json({
      success: true,
      pagination: {
        page: 1,
        limit,
        total: 0,
        totalPages: 0,
      },
      data: [],
    });
  }
}
