import type { Prisma } from '@prisma/client';

// A usage "counts" when its order is paid, or still awaiting payment within
// its 15-minute window. Expired or cancelled checkouts free the voucher again.
function countingOrderStates(now: Date): Prisma.VoucherUsageWhereInput['OR'] {
  return [
    { order: { paymentStatus: { in: ['paid', 'paid_manual'] } } },
    {
      order: {
        paymentStatus: { in: ['pending', 'pending_manual'] },
        expiredAt: { gt: now },
      },
    },
  ];
}

/** Redemptions of a voucher across all accounts, for its total quota. */
export function activeVoucherRedemptionsWhere(
  voucherId: string,
  now = new Date()
): Prisma.VoucherUsageWhereInput {
  return { voucherId, OR: countingOrderStates(now) };
}

export type VoucherQuota = { maxRedemptions: number | null };

/** True when a quota is set and the counted redemptions already reach it. */
export function isVoucherQuotaReached(voucher: VoucherQuota, activeRedemptions: number): boolean {
  return voucher.maxRedemptions !== null && activeRedemptions >= voucher.maxRedemptions;
}

/** Keep unpaid history, but do not let expired/cancelled checkouts burn a voucher. */
export function blockingVoucherUsageWhere(
  voucherId: string,
  userId: string,
  now = new Date()
): Prisma.VoucherUsageWhereInput {
  return { voucherId, userId, OR: countingOrderStates(now) };
}
