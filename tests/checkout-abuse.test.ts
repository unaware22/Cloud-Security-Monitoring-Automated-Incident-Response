import assert from 'node:assert/strict';
import test from 'node:test';
import { findPendingCheckoutLimit } from '../src/lib/checkout-abuse';

const now = new Date('2026-10-01T00:00:00Z');

test('guest is limited by active pending orders from the same IP', async () => {
  const calls: string[] = [];
  const limit = await findPendingCheckoutLimit(
    { userId: null, ipAddress: '198.51.100.10' },
    async (scope, identifier) => {
      calls.push(`${scope}:${identifier}`);
      return 5;
    },
    now
  );

  assert.deepEqual(limit, { scope: 'ip', limit: 5 });
  assert.deepEqual(calls, ['ip:198.51.100.10']);
});

test('signed-in customer is limited by account even after changing IP', async () => {
  const calls: string[] = [];
  const limit = await findPendingCheckoutLimit(
    { userId: 'customer-1', ipAddress: '203.0.113.20' },
    async (scope, identifier) => {
      calls.push(`${scope}:${identifier}`);
      return scope === 'account' ? 3 : 0;
    },
    now
  );

  assert.deepEqual(limit, { scope: 'account', limit: 3 });
  assert.deepEqual(calls, ['account:customer-1']);
});

test('normal customer remains eligible when both counts are below their limits', async () => {
  const limit = await findPendingCheckoutLimit(
    { userId: 'customer-2', ipAddress: '203.0.113.21' },
    async () => 1,
    now
  );

  assert.equal(limit, null);
});

test('IP limit still applies to signed-in customers on shared networks', async () => {
  const limit = await findPendingCheckoutLimit(
    { userId: 'customer-3', ipAddress: '203.0.113.22' },
    async (scope) => scope === 'account' ? 0 : 5,
    now
  );

  assert.deepEqual(limit, { scope: 'ip', limit: 5 });
});
