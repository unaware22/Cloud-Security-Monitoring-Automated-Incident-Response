import crypto from 'crypto';
import net from 'net';

export type IpControlActionName = 'block' | 'unblock';
export type IpControlStatus =
  | 'pending'
  | 'blocked'
  | 'unblocked'
  | 'rejected'
  | 'failed';

export type IpControlBlockMode = 'temporary' | 'permanent';

type IpControlLifecycleInput = {
  blockMode?: IpControlBlockMode | null;
  timeoutSeconds?: number | null;
  expiresAt?: Date | null;
};

// A release is a separate event, not a new permanent block. Always clear
// lifecycle metadata even if an upstream workflow sends a stale block mode.
export function getIpControlLifecycleData(
  action: IpControlActionName,
  input: IpControlLifecycleInput
): IpControlLifecycleInput {
  if (action === 'unblock') {
    return { blockMode: null, timeoutSeconds: null, expiresAt: null };
  }

  return {
    ...(input.blockMode !== undefined ? { blockMode: input.blockMode } : {}),
    ...(input.timeoutSeconds !== undefined
      ? { timeoutSeconds: input.timeoutSeconds }
      : {}),
    ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
  };
}

export function isPublicIpv4(value: string): boolean {
  if (net.isIP(value) !== 4) return false;

  const [first, second, third] = value.split('.').map(Number);

  // Match the active-response guardrails: management, private, Tailscale,
  // link-local, documentation, benchmark, multicast and reserved addresses
  // must never be written to the public Nginx deny list.
  if (first === 0 || first === 10 || first === 127 || first >= 224) return false;
  if (first === 100 && second >= 64 && second <= 127) return false;
  if (first === 169 && second === 254) return false;
  if (first === 172 && second >= 16 && second <= 31) return false;
  if (first === 192 && second === 168) return false;
  if (first === 192 && second === 0 && third === 2) return false;
  if (first === 198 && (second === 18 || second === 19)) return false;
  if (first === 198 && second === 51 && third === 100) return false;
  if (first === 203 && second === 0 && third === 113) return false;

  return true;
}

export function buildIpControlExternalId(
  action: IpControlActionName,
  alertId: string
): string {
  return crypto
    .createHash('sha256')
    .update(`${action}:${alertId}`)
    .digest('hex');
}

export function getIpControlConfiguration(): {
  webhookUrl: string;
  webhookToken: string;
} | null {
  const webhookUrl = process.env.N8N_IP_CONTROL_WEBHOOK_URL?.trim();
  const webhookToken = process.env.N8N_IP_CONTROL_WEBHOOK_TOKEN?.trim();

  if (!webhookUrl || !webhookToken || webhookToken.length < 32) return null;

  try {
    const parsed = new URL(webhookUrl);
    if (parsed.protocol !== 'https:') return null;
  } catch {
    return null;
  }

  return { webhookUrl, webhookToken };
}
