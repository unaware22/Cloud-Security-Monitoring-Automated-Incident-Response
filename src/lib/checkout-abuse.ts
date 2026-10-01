export type PendingCheckoutScope = 'account' | 'ip';

export interface PendingCheckoutIdentity {
  userId: string | null;
  ipAddress: string;
}

export interface PendingCheckoutLimit {
  scope: PendingCheckoutScope;
  limit: number;
}

function readLimit(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 20 ? parsed : fallback;
}

export function getPendingCheckoutLimits() {
  return {
    account: readLimit(process.env.CHECKOUT_MAX_PENDING_PER_ACCOUNT, 3),
    ip: readLimit(process.env.CHECKOUT_MAX_PENDING_PER_IP, 5),
  };
}

/** Count only orders still awaiting payment within their 15-minute window. */
export async function findPendingCheckoutLimit(
  identity: PendingCheckoutIdentity,
  count: (scope: PendingCheckoutScope, identifier: string, now: Date) => Promise<number>,
  now = new Date()
): Promise<PendingCheckoutLimit | null> {
  const limits = getPendingCheckoutLimits();

  if (identity.userId && (await count('account', identity.userId, now)) >= limits.account) {
    return { scope: 'account', limit: limits.account };
  }

  if ((await count('ip', identity.ipAddress, now)) >= limits.ip) {
    return { scope: 'ip', limit: limits.ip };
  }

  return null;
}
