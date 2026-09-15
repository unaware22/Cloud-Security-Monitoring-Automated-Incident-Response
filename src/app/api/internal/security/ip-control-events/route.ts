import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  buildIpControlExternalId,
  isPublicIpv4,
} from '@/lib/ip-control';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const EventSchema = z.object({
  action: z.enum(['block', 'unblock']),
  status: z.enum(['pending', 'blocked', 'unblocked', 'rejected', 'failed']),
  ip_address: z.string().trim().min(7).max(45),
  actor: z.string().trim().min(1).max(160),
  alert_id: z.string().trim().min(1).max(240),
  source: z.string().trim().min(1).max(100).default('n8n'),
  reason: z.string().trim().max(240).optional(),
  rule_id: z.string().trim().max(32).optional(),
  detail: z.string().trim().max(1500).optional(),
});

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.SECURITY_AUTOMATION_TOKEN;
  const supplied = req.headers.get('x-security-automation-token');

  if (!expected || expected.length < 32 || !supplied) return false;

  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 });
  }

  const parsed = EventSchema.safeParse(body);
  if (!parsed.success || !isPublicIpv4(parsed.data?.ip_address || '')) {
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 });
  }

  const event = parsed.data;
  const externalId = buildIpControlExternalId(event.action, event.alert_id);
  const completedAt = ['blocked', 'unblocked', 'rejected', 'failed'].includes(event.status)
    ? new Date()
    : null;

  try {
    const action = await prisma.ipControlAction.upsert({
      where: { externalId },
      create: {
        externalId,
        ipAddress: event.ip_address,
        action: event.action,
        status: event.status,
        actor: event.actor,
        source: event.source,
        reason: event.reason,
        ruleId: event.rule_id,
        detail: event.detail,
        completedAt,
      },
      update: {
        status: event.status,
        actor: event.actor,
        source: event.source,
        reason: event.reason,
        ruleId: event.rule_id,
        detail: event.detail,
        completedAt,
      },
    });

    return NextResponse.json({ success: true, data: action });
  } catch (error) {
    console.error('[IP Control Callback] Unable to persist action:', error);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}
