import type { Prisma } from '@prisma/client';

/** Keep unpaid history, but do not let expired/cancelled checkouts burn a voucher. */
export function blockingVoucherUsageWhere(
  voucherId: string,
  userId: string,
  now = new Date()
): Prisma.VoucherUsageWhereInput {
  return {
    voucherId,
    userId,
    OR: [
      { order: { paymentStatus: { in: ['paid', 'paid_manual'] } } },
      {
        order: {
          paymentStatus: { in: ['pending', 'pending_manual'] },
          expiredAt: { gt: now },
        },
      },
    ],
  };
}
