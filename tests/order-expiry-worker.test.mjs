import assert from 'node:assert/strict';
import test from 'node:test';
import { expireUnpaidOrders, getGatewayState } from '../scripts/expire-unpaid-orders.mjs';

const response = (status, body = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

test('gateway status paid never expires or calls cancel', async () => {
  let calls = 0;
  const result = await getGatewayState('ORDER-1', 'test-key', async () => {
    calls += 1;
    return response(200, { order_id: 'ORDER-1', transaction_status: 'settlement' });
  });
  assert.equal(result.safeToExpire, false);
  assert.equal(calls, 1);
});

test('pending gateway transaction must be cancelled before local expiry', async () => {
  const calls = [];
  const result = await getGatewayState('ORDER-2', 'test-key', async (_url, options) => {
    calls.push(options.method || 'GET');
    return options.method === 'POST'
      ? response(200, { transaction_status: 'cancel' })
      : response(200, { order_id: 'ORDER-2', transaction_status: 'pending' });
  });
  assert.equal(result.safeToExpire, true);
  assert.deepEqual(calls, ['GET', 'POST']);
});

test('gateway errors fail closed without expiring', async () => {
  for (const status of [401, 429, 500]) {
    const result = await getGatewayState('ORDER-3', 'test-key', async () => response(status));
    assert.equal(result.safeToExpire, false);
  }
});

test('missing provider transaction can expire, but a vanished pending one cannot', async () => {
  const missing = await getGatewayState('ORDER-4', 'test-key', async () => response(404));
  assert.equal(missing.safeToExpire, true);

  const vanished = await getGatewayState('ORDER-5', 'test-key', async (_url, options) =>
    options.method === 'POST'
      ? response(404)
      : response(200, { order_id: 'ORDER-5', transaction_status: 'pending' })
  );
  assert.equal(vanished.safeToExpire, false);
});

test('expired order changes all three statuses once, preserving order history', async () => {
  const updates = [];
  const prisma = {
    order: {
      findMany: async () => [{ id: 'order-1', orderCode: 'ORDER-1' }],
    },
    $transaction: async (callback) => callback({
      order: { updateMany: async (query) => { updates.push(query); return { count: 1 }; } },
      paymentTransaction: { updateMany: async (query) => { updates.push(query); } },
    }),
  };
  const result = await expireUnpaidOrders(prisma, 'test-key', new Date('2026-10-01T00:15:00Z'), async () => ({ safeToExpire: true, reason: 'cancelled' }));
  assert.deepEqual(result, { scanned: 1, expired: 1 });
  assert.equal(updates[0].where.paymentStatus, 'pending');
  assert.equal(updates[0].data.paymentStatus, 'expired');
  assert.equal(updates[0].data.orderStatus, 'cancelled');
  assert.equal(updates[0].data.deliveryStatus, 'cancelled');
  assert.equal(updates[1].data.status, 'expired');
});
