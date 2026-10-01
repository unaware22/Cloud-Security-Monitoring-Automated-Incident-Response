import assert from 'node:assert/strict';
import test from 'node:test';
import { blockingVoucherUsageWhere } from '../src/lib/voucher-usage';

test('only paid or not-yet-expired pending orders reserve single-use vouchers', () => {
  const now = new Date('2026-10-01T00:00:00Z');
  assert.deepEqual(blockingVoucherUsageWhere('voucher-1', 'user-1', now), {
    voucherId: 'voucher-1',
    userId: 'user-1',
    OR: [
      { order: { paymentStatus: { in: ['paid', 'paid_manual'] } } },
      {
        order: {
          paymentStatus: { in: ['pending', 'pending_manual'] },
          expiredAt: { gt: now },
        },
      },
    ],
  });
});
