import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeVoucherRedemptionsWhere, isVoucherQuotaReached } from '../src/lib/voucher-usage';

test('quota of 100 is reached at 100 counted redemptions, not before', () => {
  const voucher = { maxRedemptions: 100 };
  assert.equal(isVoucherQuotaReached(voucher, 0), false);
  assert.equal(isVoucherQuotaReached(voucher, 99), false);
  assert.equal(isVoucherQuotaReached(voucher, 100), true);
  assert.equal(isVoucherQuotaReached(voucher, 101), true);
});

test('a voucher without a quota is never exhausted', () => {
  assert.equal(isVoucherQuotaReached({ maxRedemptions: null }, 1_000_000), false);
});

test('redemptions count paid orders and unpaid orders still inside their window', () => {
  const now = new Date('2026-11-22T10:00:00Z');
  const where = activeVoucherRedemptionsWhere('voucher-1', now) as any;
  assert.equal(where.voucherId, 'voucher-1');
  assert.equal(where.userId, undefined); // across all accounts
  assert.deepEqual(where.OR[0], { order: { paymentStatus: { in: ['paid', 'paid_manual'] } } });
  assert.deepEqual(where.OR[1], {
    order: { paymentStatus: { in: ['pending', 'pending_manual'] }, expiredAt: { gt: now } },
  });
});
