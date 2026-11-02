import net from 'net';
import { cookies, headers } from 'next/headers';
import { prisma } from './prisma';
import { isPublicIpv4 } from './ip-control';
import { recordSecurityEvent } from './security';
import { CUSTOMER_COOKIE_NAME, verifyUserToken } from './user-auth';
import { DEVICE_HEADER_NAME, deviceReference } from './device-id';

// Event types that justify a temporary device/account ban. Noisy signals such
// as a single failed login or a plain rate-limit hit are intentionally absent.
// Checkout abuse, bot orders (S06), voucher abuse (S07) and password-reset
// abuse (S10) are only limited by their own rules (rate limits, CAPTCHA,
// single-use tokens) and monitored by Wazuh: those users are restricted,
// never banned.
const BAN_EVENT_TYPES = new Set<string>([
  'sql_injection_attempt',
  'xss_attempt',
  'sensitive_path_scan',
  'user_bruteforce_attempt',
  'admin_bruteforce_attempt',
  'credential_stuffing_attempt',
  'account_takeover_attempt',
  'order_enumeration_attempt',
  'unauthorized_order_access',
  'unauthorized_object_access_attempt',
  'order_cancellation_abuse',
]);

// A brute-forced login targets somebody else's account, so banning the
// *session* account would punish the victim. Only the device is banned there.
const DEVICE_ONLY_EVENT_TYPES = new Set<string>([
  'user_bruteforce_attempt',
  'admin_bruteforce_attempt',
  'credential_stuffing_attempt',
  'account_takeover_attempt',
]);

// Events that a legitimate customer can trigger once by mistake (e.g. a
// mistyped order code) only lead to a ban after repeated hits.
const EVENT_THRESHOLDS: Record<string, number> = {
  unauthorized_object_access_attempt: 3,
  unauthorized_order_access: 3,
};
const THRESHOLD_WINDOW_MS = 10 * 60 * 1000;
const thresholdCounters = new Map<string, { count: number; resetAt: number }>();

function reachedThreshold(eventType: string, subjectKey: string): boolean {
  const threshold = EVENT_THRESHOLDS[eventType];
  if (!threshold) return true;

  const now = Date.now();
  const key = `${eventType}:${subjectKey}`;
  let counter = thresholdCounters.get(key);
  if (!counter || counter.resetAt <= now) {
    counter = { count: 0, resetAt: now + THRESHOLD_WINDOW_MS };
    thresholdCounters.set(key, counter);
  }
  counter.count += 1;
  if (thresholdCounters.size > 10_000) {
    for (const [k, c] of thresholdCounters) if (c.resetAt <= now) thresholdCounters.delete(k);
  }
  return counter.count >= threshold;
}

const STRIKE_WINDOW_MS = 24 * 3600 * 1000;

function readMinutes(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.min(Math.floor(value), 24 * 60);
}

export function getDeviceBanConfig() {
  return {
    enabled: process.env.DEVICE_BAN_ENABLED !== 'false',
    // First offence: 30 minutes. Repeat offence within 24h: 60 minutes.
    baseMinutes: readMinutes('DEVICE_BAN_BASE_MINUTES', 30),
    repeatMinutes: readMinutes('DEVICE_BAN_REPEAT_MINUTES', 60),
    // Lab/homelab testing from LAN or localhost; keep false in production.
    allowPrivateIp: process.env.DEVICE_BAN_ALLOW_PRIVATE_IP === 'true',
  };
}

function isBannableIp(ip: string): boolean {
  if (isPublicIpv4(ip)) return true;
  if (getDeviceBanConfig().allowPrivateIp) return net.isIP(ip) !== 0;
  // Public IPv6 is allowed; loopback/link-local/unique-local are not.
  if (net.isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    return !(lower === '::1' || lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd'));
  }
  return false;
}

async function getRequestContext(): Promise<{ deviceId: string | null; userId: string | null }> {
  let deviceId: string | null = null;
  let userId: string | null = null;
  try {
    deviceId = headers().get(DEVICE_HEADER_NAME);
  } catch {}
  try {
    const token = cookies().get(CUSTOMER_COOKIE_NAME)?.value;
    if (token) userId = (await verifyUserToken(token))?.userId ?? null;
  } catch {}
  return { deviceId, userId };
}

export async function resolveEventSubjects(explicit?: {
  deviceId?: string | null;
}): Promise<{ deviceId: string | null; userId: string | null; deviceRef: string | null }> {
  const ctx = await getRequestContext();
  const deviceId = explicit?.deviceId || ctx.deviceId;
  return {
    deviceId,
    userId: ctx.userId,
    deviceRef: deviceId ? await deviceReference(deviceId) : null,
  };
}

export async function getActivePenalty(kind: 'device' | 'account', subject: string) {
  try {
    return await prisma.securityPenalty.findFirst({
      where: { kind, subject, liftedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: 'desc' },
    });
  } catch {
    // Fail open: a database outage must not lock every customer out.
    return null;
  }
}

export async function recordPenaltyHit(penaltyId: string, ip: string): Promise<void> {
  await prisma.securityPenalty
    .update({
      where: { id: penaltyId },
      data: { hitCount: { increment: 1 }, lastHitAt: new Date(), lastHitIp: ip },
    })
    .catch(() => {});
}

async function createPenalty(params: {
  kind: 'device' | 'account';
  subject: string;
  subjectRef: string;
  label?: string;
  eventType: string;
  ip: string;
  userAgent?: string;
  description?: string;
  requestId?: string;
}): Promise<void> {
  const config = getDeviceBanConfig();
  if (await getActivePenalty(params.kind, params.subject)) return;

  const priorStrikes = await prisma.securityPenalty.count({
    where: {
      kind: params.kind,
      subject: params.subject,
      createdAt: { gt: new Date(Date.now() - STRIKE_WINDOW_MS) },
    },
  });
  const strike = priorStrikes + 1;
  const minutes = strike >= 2 ? config.repeatMinutes : config.baseMinutes;
  const expiresAt = new Date(Date.now() + minutes * 60_000);

  await prisma.securityPenalty.create({
    data: {
      kind: params.kind,
      subject: params.subject,
      subjectRef: params.subjectRef,
      label: params.label,
      eventType: params.eventType,
      reason: params.description || params.eventType,
      ipAddress: params.ip,
      userAgent: params.userAgent,
      strike,
      expiresAt,
    },
  });

  if (params.kind === 'account') {
    // Revoke existing customer sessions immediately.
    await prisma.user
      .update({ where: { id: params.subject }, data: { sessionVersion: { increment: 1 } } })
      .catch(() => {});
  }

  await recordSecurityEvent({
    eventType: params.kind === 'device' ? 'device_banned' : 'account_banned',
    severity: 'high',
    ipAddress: params.ip,
    method: 'SYSTEM',
    endpoint: 'device-ban',
    userAgent: params.userAgent,
    payloadSnippet: `kind=${params.kind}; subject_ref=${params.subjectRef}; trigger=${params.eventType}; strike=${strike}; ban_minutes=${minutes}; expires_at=${expiresAt.toISOString()}`,
    statusCode: 403,
    description: `Temporary ${params.kind} ban applied after ${params.eventType}`,
    requestId: params.requestId,
    deviceId: params.kind === 'device' ? params.subject : undefined,
    skipPenalty: true,
  });
}

/**
 * Called by recordSecurityEvent for every event. Bans the device (signed
 * cookie) and, when the attacker is logged in, their own customer account.
 * Never throws: a failure here must not break the request being logged.
 */
export async function applyPenaltiesForEvent(params: {
  eventType: string;
  ipAddress: string;
  userAgent?: string;
  description?: string;
  requestId?: string;
  deviceId?: string | null;
}): Promise<void> {
  try {
    const config = getDeviceBanConfig();
    if (!config.enabled || !BAN_EVENT_TYPES.has(params.eventType)) return;
    if (!isBannableIp(params.ipAddress)) return;

    const subjects = await resolveEventSubjects({ deviceId: params.deviceId });
    const subjectKey = subjects.userId || subjects.deviceId || params.ipAddress;
    if (!reachedThreshold(params.eventType, subjectKey)) return;

    if (subjects.deviceId && subjects.deviceRef) {
      await createPenalty({
        kind: 'device',
        subject: subjects.deviceId,
        subjectRef: subjects.deviceRef,
        eventType: params.eventType,
        ip: params.ipAddress,
        userAgent: params.userAgent,
        description: params.description,
        requestId: params.requestId,
      });
    }

    if (subjects.userId && !DEVICE_ONLY_EVENT_TYPES.has(params.eventType)) {
      const user = await prisma.user.findUnique({
        where: { id: subjects.userId },
        select: { id: true, email: true, role: true },
      });
      if (user && user.role === 'customer') {
        await createPenalty({
          kind: 'account',
          subject: user.id,
          subjectRef: user.id.slice(0, 8),
          label: user.email,
          eventType: params.eventType,
          ip: params.ipAddress,
          userAgent: params.userAgent,
          description: params.description,
          requestId: params.requestId,
        });
      }
    }
  } catch (error) {
    console.error('Device/account ban could not be applied:', error);
  }
}

export async function liftPenalty(id: string, actor: string) {
  const penalty = await prisma.securityPenalty.findUnique({ where: { id } });
  if (!penalty || penalty.liftedAt) return null;

  const updated = await prisma.securityPenalty.update({
    where: { id },
    data: { liftedAt: new Date(), liftedBy: actor },
  });

  await recordSecurityEvent({
    eventType: 'penalty_lifted',
    severity: 'low',
    ipAddress: penalty.ipAddress,
    method: 'SYSTEM',
    endpoint: 'device-ban',
    payloadSnippet: `kind=${penalty.kind}; subject_ref=${penalty.subjectRef}; lifted_by=${actor}`,
    statusCode: 200,
    description: `Temporary ${penalty.kind} ban lifted manually`,
    skipPenalty: true,
  });

  return updated;
}
