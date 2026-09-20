import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSession } from '@/lib/auth';
import {
  buildIpControlExternalId,
  getIpControlConfiguration,
  isPublicIpv4,
} from '@/lib/ip-control';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, RATE_LIMIT_RULES } from '@/lib/rate-limiter';
import { getClientIp } from '@/lib/security';

export const dynamic = 'force-dynamic';

const RequestSchema = z.object({
  action: z.enum(['block', 'unblock']),
  ip_address: z.string().trim().min(7).max(45),
  reason: z.string().trim().min(3).max(240),
});

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

function findWazuhResult(payload: unknown): any | null {
  const root = Array.isArray(payload) ? payload[0] : payload;
  if (!root || typeof root !== 'object') return null;

  const value = root as any;
  const candidates = [
    value,
    value.result,
    value.body,
    value.data?.result,
    value.data?.body,
  ];

  return (
    candidates.find(
      (candidate) =>
        candidate &&
        typeof candidate === 'object' &&
        typeof candidate.error === 'number' &&
        candidate.data
    ) || null
  );
}

function compactDetail(value: unknown): string {
  try {
    return JSON.stringify(value)
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]')
      .slice(0, 1500);
  } catch {
    return 'Unable to serialize n8n response';
  }
}

export async function GET(req: NextRequest) {
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [history, terminalActions, pendingCount] = await Promise.all([
      prisma.ipControlAction.findMany({
        take: 100,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.ipControlAction.findMany({
        where: { status: { in: ['blocked', 'unblocked'] } },
        take: 2000,
        // A pending dashboard request can be confirmed later by Wazuh.  The
        // latest state therefore follows the last update, not row creation.
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.ipControlAction.count({
        where: { status: 'pending' },
      }),
    ]);

    const latestByIp = new Map<string, (typeof terminalActions)[number]>();
    for (const action of terminalActions) {
      if (!latestByIp.has(action.ipAddress)) {
        latestByIp.set(action.ipAddress, action);
      }
    }

    const now = Date.now();
    const blockedIps = Array.from(latestByIp.values()).filter((action) => {
      if (action.action !== 'block' || action.status !== 'blocked') return false;

      // Do not leave an expired temporary block displayed when an auto-expire
      // callback is delayed. Permanent blocks are only removed by an explicit
      // confirmed unblock event.
      return !(
        action.blockMode === 'temporary' &&
        action.expiresAt &&
        action.expiresAt.getTime() <= now
      );
    });

    return NextResponse.json({
      success: true,
      data: {
        blocked_ips: blockedIps,
        history,
        summary: {
          blocked: blockedIps.length,
          pending: pendingCount,
          recent_failures: history.filter((action) => action.status === 'failed').length,
        },
      },
    });
  } catch (error) {
    console.error('[Admin IP Control] Unable to load response state:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Status respons IP gagal dimuat.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Sesi admin tidak valid atau telah berakhir.' },
      { status: 401 }
    );
  }

  if (!hasValidOrigin(req)) {
    return NextResponse.json(
      { error: 'Forbidden', message: 'Permintaan lintas situs ditolak.' },
      { status: 403 }
    );
  }

  const requesterIp = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'Unknown';
  const requestId = req.headers.get('x-request-id') || `ipctl-${crypto.randomUUID()}`;
  const rateLimit = await checkRateLimit(requesterIp, RATE_LIMIT_RULES.ADMIN_IP_CONTROL, {
    endpoint: '/api/admin/security/ip-control',
    method: 'POST',
    userAgent,
    requestId,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests', message: 'Terlalu banyak tindakan kontrol IP.' },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Bad Request', message: 'Format JSON tidak valid.' },
      { status: 400 }
    );
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Bad Request', message: parsed.error.issues[0]?.message || 'Input tidak valid.' },
      { status: 400 }
    );
  }

  const { action, reason } = parsed.data;
  const ipAddress = parsed.data.ip_address;
  if (!isPublicIpv4(ipAddress)) {
    return NextResponse.json(
      {
        error: 'Bad Request',
        message: 'Hanya IPv4 publik yang dapat dikontrol. IP private/Tailscale dilindungi.',
      },
      { status: 400 }
    );
  }

  const configuration = getIpControlConfiguration();
  if (!configuration) {
    return NextResponse.json(
      {
        error: 'Service Unavailable',
        message: 'Webhook kontrol IP n8n belum dikonfigurasi pada server.',
      },
      { status: 503 }
    );
  }

  const alertId = requestId;
  const externalId = buildIpControlExternalId(action, alertId);
  const actor = `admin:${session.email}`;

  const pendingAction = await prisma.ipControlAction.create({
    data: {
      externalId,
      ipAddress,
      action,
      status: 'pending',
      actor,
      source: 'admin_dashboard',
      reason,
      blockMode: action === 'block' ? 'permanent' : null,
      timeoutSeconds: null,
      expiresAt: null,
    },
  });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let response: Response;

    try {
      response = await fetch(configuration.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Control-Token': configuration.webhookToken,
        },
        body: JSON.stringify({
          action,
          ip_address: ipAddress,
          actor,
          alert_id: alertId,
          reason,
        }),
        cache: 'no-store',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const responseText = await response.text();
    let responseBody: unknown = responseText;
    try {
      responseBody = responseText ? JSON.parse(responseText) : {};
    } catch {}

    if (!response.ok) {
      throw new Error(`n8n returned HTTP ${response.status}: ${responseText.slice(0, 300)}`);
    }

    const wazuhResult = findWazuhResult(responseBody);
    const affectedItems = Array.isArray(wazuhResult?.data?.affected_items)
      ? wazuhResult.data.affected_items.map(String)
      : [];
    const confirmed = wazuhResult?.error === 0 && affectedItems.includes('001');
    const status = confirmed ? (action === 'block' ? 'blocked' : 'unblocked') : 'pending';
    const completedAt = confirmed ? new Date() : null;

    const [updatedAction] = await prisma.$transaction([
      prisma.ipControlAction.update({
        where: { id: pendingAction.id },
        data: {
          status,
          completedAt,
          detail: compactDetail(responseBody),
        },
      }),
      prisma.auditLog.create({
        data: {
          adminId: session.userId,
          action: action === 'block' ? 'IP_BLOCK_REQUEST' : 'IP_UNBLOCK_REQUEST',
          entityType: 'ip_address',
          entityId: ipAddress,
          newValue: JSON.stringify({ status, reason, alert_id: alertId }),
          ipAddress: requesterIp,
          userAgent,
        },
      }),
    ]);

    return NextResponse.json(
      {
        success: true,
        message: confirmed
          ? `IP ${ipAddress} berhasil ${action === 'block' ? 'diblokir' : 'dibuka kembali'}.`
          : 'Perintah diterima n8n dan menunggu konfirmasi akhir dari Wazuh.',
        data: updatedAction,
      },
      { status: confirmed ? 200 : 202 }
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 1000) : 'Unknown error';

    await prisma.$transaction([
      prisma.ipControlAction.update({
        where: { id: pendingAction.id },
        data: { status: 'failed', detail, completedAt: new Date() },
      }),
      prisma.auditLog.create({
        data: {
          adminId: session.userId,
          action: action === 'block' ? 'IP_BLOCK_FAILED' : 'IP_UNBLOCK_FAILED',
          entityType: 'ip_address',
          entityId: ipAddress,
          newValue: JSON.stringify({ status: 'failed', reason, detail }),
          ipAddress: requesterIp,
          userAgent,
        },
      }),
    ]);

    console.error('[Admin IP Control] n8n request failed:', detail);
    return NextResponse.json(
      { error: 'Bad Gateway', message: 'n8n/Wazuh tidak dapat menjalankan tindakan tersebut.' },
      { status: 502 }
    );
  }
}
