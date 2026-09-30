import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { createUserToken, getCustomerSession } from '../src/lib/user-auth';
import {
  canAccessMemoryOrder, checkoutOrderWhere, customerOrderWhere, customerOrderSelect, customerOrderDetail,
  deliveredContent, CustomerOrder,
} from '../src/lib/customer-order';
import { GET as detailGET } from '../src/app/api/user/orders/[orderCode]/route';
import { GET as listGET } from '../src/app/api/user/orders/route';
import { POST as manualPOST } from '../src/app/api/orders/manual-payment/route';
import { POST as verifyPOST } from '../src/app/api/orders/verify-payment/route';
import { POST as checkPOST } from '../src/app/api/orders/check/route';
import { POST as cancelPOST } from '../src/app/api/orders/cancel/route';
import { resetRateLimit, RATE_LIMIT_RULES } from '../src/lib/rate-limiter';
import type { CustomerSessionPayload } from '../src/lib/types';

process.env.CUSTOMER_JWT_SECRET = 'order-security-test-secret-at-least-32-characters';

const session: CustomerSessionPayload = {
  userId: 'user-a', email: 'buyer@example.test', name: 'Buyer A', role: 'customer', sessionVersion: 1,
};
const fixture = (): CustomerOrder => ({
  id: 'order-a', orderCode: 'ORD-TEST2345', customerName: 'Buyer A',
  customerEmail: session.email, customerPhone: '0800000000', totalAmount: 30000,
  discountAmount: 0, voucherCode: null, orderStatus: 'waiting_payment',
  paymentStatus: 'pending', deliveryStatus: 'pending', paymentMethod: 'dana',
  createdAt: new Date(), updatedAt: new Date(), paidAt: null, expiredAt: null,
  orderItems: [{
    id: 'item-a', productId: 'product-a', productNameSnapshot: 'Test product',
    priceSnapshot: 30000, quantity: 1, subtotal: 30000,
    product: {
      id: 'product-a', name: 'Test product', slug: 'test-product', imageUrl: '/test.webp',
      game: 'minecraft', deliveryType: 'automatic', serviceTag: 'proses-instant',
      deliveryContent: 'UNALLOCATED-INVENTORY-SECRET',
    },
  }],
  digitalDeliveries: [{
    deliveryStatus: 'delivered', deliveredAt: new Date(), deliveryData: 'ALLOCATED-ORDER-A',
  }],
  paymentTransactions: [{
    provider: 'midtrans', paymentUrl: 'https://app.sandbox.midtrans.com/snap/test',
    providerInvoiceId: 'test-snap-token', status: 'pending',
    rawPayload: '{"server_key":"DO-NOT-RETURN"}',
  }],
} as unknown as CustomerOrder);

// Prisma delegates expose methods through a Proxy, which node:test's
// descriptor-based mock.method cannot replace. Restore every stub explicitly.
const restorers: Array<() => void> = [];
function stub(target: object, key: string, implementation: (...args: any[]) => any) {
  const delegate = target as Record<string, any>;
  const original = delegate[key];
  const replacement = mock.fn(implementation);
  delegate[key] = replacement;
  restorers.push(() => { delegate[key] = original; });
  return replacement;
}
function restoreStubs() {
  for (const restore of restorers.splice(0).reverse()) restore();
}

async function request(path: string, authenticated = true) {
  const headers: Record<string, string> = { 'x-real-ip': '192.0.2.41' };
  if (authenticated) headers.Authorization = `Bearer ${await createUserToken(session)}`;
  return new NextRequest(`https://shop.example.test${path}`, { headers });
}

function stubSession() {
  stub(prisma.user, 'findUnique', async () => ({
    id: session.userId, email: session.email, name: session.name, role: 'customer',
    sessionVersion: 1, isEmailVerified: true,
  }));
}

afterEach(() => {
  restoreStubs();
  mock.restoreAll();
  resetRateLimit('192.0.2.41', RATE_LIMIT_RULES.ORDER_DETAIL);
  resetRateLimit('192.0.2.41', RATE_LIMIT_RULES.CHECK_ORDER);
  resetRateLimit('192.0.2.41', RATE_LIMIT_RULES.CANCEL_ORDER);
  resetRateLimit('192.0.2.41', RATE_LIMIT_RULES.VERIFY_PAYMENT);
  resetRateLimit('192.0.2.42', RATE_LIMIT_RULES.VERIFY_PAYMENT);
});

test('ownership email fallback applies only to guest orders', () => {
  assert.deepEqual(customerOrderWhere(session), { OR: [
    { userId: 'user-a' },
    { userId: null, customerEmail: { equals: session.email, mode: 'insensitive' } },
  ] });
  assert.equal('deliveryContent' in customerOrderSelect.orderItems.select.product.select, false);
});

test('checkout lookups require session ownership for account orders and keep guest orders available', () => {
  const base = { orderCode: 'ORD-TEST2345', customerEmail: { equals: session.email, mode: 'insensitive' } };
  assert.deepEqual(checkoutOrderWhere('ORD-TEST2345', session.email, session), {
    ...base, OR: [{ userId: session.userId }, { userId: null }],
  });
  assert.deepEqual(checkoutOrderWhere('ORD-TEST2345', session.email, null), {
    ...base, userId: null,
  });
  assert.equal(canAccessMemoryOrder({ userId: 'user-b' }, session), false);
  assert.equal(canAccessMemoryOrder({ userId: 'user-b' }, null), false);
  assert.equal(canAccessMemoryOrder({ userId: null }, null), true);
});

test('unpaid order never exposes delivery, inventory, payment payload or token', () => {
  const result = customerOrderDetail(fixture());
  assert.deepEqual(result.digitalDeliveries, []);
  const json = JSON.stringify(result);
  for (const secret of ['UNALLOCATED-INVENTORY-SECRET', 'ALLOCATED-ORDER-A', 'DO-NOT-RETURN', 'test-snap-token']) {
    assert.equal(json.includes(secret), false);
  }
});

test('paid order returns only its allocated delivery, without truncating multiline credentials', () => {
  const order = fixture();
  order.paymentStatus = 'paid';
  order.deliveryStatus = 'delivered';
  order.digitalDeliveries[0].deliveryData = 'Username: test\nPassword: test-fixture';
  assert.equal(customerOrderDetail(order).digitalDeliveries[0].deliveryData,
    'Username: test\nPassword: test-fixture');
  assert.equal(JSON.stringify(customerOrderDetail(order)).includes('UNALLOCATED'), false);
});

test('paid but undelivered order has no inventory fallback', () => {
  const order = fixture();
  order.paymentStatus = 'paid';
  order.digitalDeliveries = [];
  assert.equal(deliveredContent(order), null);
  order.deliveryStatus = 'delivered';
  assert.equal(deliveredContent(order), null);
});

test('cancelled, failed and pending_manual payments cannot reveal a delivery row', () => {
  for (const status of ['cancelled', 'failed', 'pending_manual', 'expired', 'rejected']) {
    const order = fixture();
    order.paymentStatus = status;
    order.deliveryStatus = 'delivered';
    assert.equal(deliveredContent(order), null);
  }
});

test('unauthenticated detail request cannot query orders', async () => {
  const query = stub(prisma.order, 'findFirst', () => { throw new Error('Must not query'); });
  const response = await detailGET(await request('/api/user/orders/ORD-TEST2345', false),
    { params: { orderCode: 'ORD-TEST2345' } });
  assert.equal(response.status, 401);
  assert.equal(query.mock.callCount(), 0);
});

test('owner detail is scoped in SQL and sends a private allowlisted response', async () => {
  stubSession();
  const query = stub(prisma.order, 'findFirst', async () => fixture());
  const response = await detailGET(await request('/api/user/orders/ORD-TEST2345'),
    { params: { orderCode: 'ORD-TEST2345' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(query.mock.calls[0].arguments[0], {
    where: { orderCode: 'ORD-TEST2345', ...customerOrderWhere(session) },
    select: customerOrderSelect,
  });
  const body = await response.json();
  assert.deepEqual(body.data.digitalDeliveries, []);
  assert.equal(JSON.stringify(body).includes('UNALLOCATED'), false);
});

test('foreign and unknown orders return the same 404 and a redacted BOLA event', async () => {
  stubSession();
  stub(prisma.order, 'findFirst', async () => null);
  const events = stub(prisma.securityEvent, 'create', async () => ({}));
  const first = await detailGET(await request('/api/user/orders/ORD-OTHER234'),
    { params: { orderCode: 'ORD-OTHER234' } });
  const second = await detailGET(await request('/api/user/orders/ORD-UNKNOWN2'),
    { params: { orderCode: 'ORD-UNKNOWN2' } });
  assert.equal(first.status, 404);
  assert.equal(second.status, 404);
  assert.deepEqual(await first.json(), await second.json());
  for (const call of events.mock.calls) {
    const data = (call.arguments[0] as any).data;
    assert.equal(data.eventType, 'unauthorized_object_access_attempt');
    assert.equal(data.ipAddress, '192.0.2.41');
    assert.equal(data.payloadSnippet.includes(session.email), false);
    assert.equal(data.payloadSnippet.includes('ORD-'), false);
  }
});

test('history has the same owner scope and hides prepayment delivery content', async () => {
  stubSession();
  const query = stub(prisma.order, 'findMany', async () => [fixture()]);
  const response = await listGET(await request('/api/user/orders'));
  assert.equal(response.status, 200);
  assert.deepEqual((query.mock.calls[0].arguments[0] as any).where, customerOrderWhere(session));
  const body = await response.json();
  assert.equal(body.data[0].deliveryContent, null);
  assert.equal(body.data[0].rawDelivery, null);
  assert.equal(JSON.stringify(body).includes('DO-NOT-RETURN'), false);
});

test('unverified or non-customer sessions are rejected', async () => {
  for (const user of [
    { role: 'customer', isEmailVerified: false },
    { role: 'admin', isEmailVerified: true },
  ]) {
    stub(prisma.user, 'findUnique', async () => ({
      id: session.userId, email: session.email, name: session.name, sessionVersion: 1, ...user,
    }));
    assert.equal(await getCustomerSession(await request('/api/user/orders')), null);
    restoreStubs();
    mock.restoreAll();
  }
});

test('legacy public manual payment is closed and cannot write orders', async () => {
  const update = stub(prisma.order, 'update', () => { throw new Error('Must not write'); });
  const create = stub(prisma.manualPaymentSubmission, 'create', () => { throw new Error('Must not write'); });
  assert.equal((await manualPOST()).status, 410);
  assert.equal(update.mock.callCount(), 0);
  assert.equal(create.mock.callCount(), 0);
});

test('payment verification rejects invalid identifiers before touching the database/provider', async () => {
  const query = stub(prisma.order, 'findFirst', () => { throw new Error('Must not query'); });
  const provider = mock.method(globalThis, 'fetch', () => { throw new Error('Must not fetch'); });
  const req = new NextRequest('https://shop.example.test/api/orders/verify-payment', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-real-ip': '192.0.2.42' },
    body: JSON.stringify({ order_code: { id: 'unexpected-object' }, email: session.email }),
  });
  assert.equal((await verifyPOST(req)).status, 400);
  assert.equal(query.mock.callCount(), 0);
  assert.equal(provider.mock.callCount(), 0);
});

test('guest order check and payment verification never substitute unsold product inventory', async () => {
  const order = fixture();
  order.paymentStatus = 'paid';
  order.deliveryStatus = 'delivered';
  order.digitalDeliveries = [];
  stub(prisma, '$queryRaw', async () => [{ '?column?': 1 }]);
  stub(prisma.order, 'findFirst', async () => order);
  stub(prisma.order, 'findUnique', async () => order);
  mock.method(globalThis, 'fetch', async () =>
    new Response('{"error_messages":["not found"]}', { status: 404 })
  );
  for (const [path, handler] of [
    ['/api/orders/check', checkPOST],
    ['/api/orders/verify-payment', verifyPOST],
  ] as const) {
    const req = new NextRequest(`https://shop.example.test${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-real-ip': '192.0.2.42' },
      body: JSON.stringify({ order_code: order.orderCode, email: session.email }),
    });
    const response = await handler(req);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.delivery_content, null);
    assert.equal(JSON.stringify(body).includes('UNALLOCATED-INVENTORY-SECRET'), false);
  }
});

test('foreign account orders are hidden from check, cancel and verify before provider calls', async () => {
  stubSession();
  stub(prisma, '$queryRaw', async () => [{ '?column?': 1 }]);
  const query = stub(prisma.order, 'findFirst', async () => null);
  stub(prisma.securityEvent, 'create', async () => ({}));
  const provider = mock.method(globalThis, 'fetch', () => { throw new Error('Must not contact payment provider'); });

  for (const [path, handler] of [
    ['/api/orders/check', checkPOST],
    ['/api/orders/cancel', cancelPOST],
    ['/api/orders/verify-payment', verifyPOST],
  ] as const) {
    const req = new NextRequest(`https://shop.example.test${path}`, {
      method: 'POST', headers: {
        'Content-Type': 'application/json', 'x-real-ip': '192.0.2.41',
        Authorization: `Bearer ${await createUserToken(session)}`,
      },
      body: JSON.stringify({ order_code: 'ORD-VICTIM01', email: 'victim@example.test' }),
    });
    const response = await handler(req);
    assert.equal(response.status, 404, path);
    const lookup = query.mock.calls.at(-1)?.arguments[0] as any;
    assert.deepEqual(lookup.where, checkoutOrderWhere('ORD-VICTIM01', 'victim@example.test', session));
  }
  assert.equal(provider.mock.callCount(), 0);
});

test('logged-out callers cannot use code and email to read or cancel account orders', async () => {
  stub(prisma, '$queryRaw', async () => [{ '?column?': 1 }]);
  const query = stub(prisma.order, 'findFirst', async () => null);
  stub(prisma.securityEvent, 'create', async () => ({}));
  const provider = mock.method(globalThis, 'fetch', () => { throw new Error('Must not contact payment provider'); });

  for (const [path, handler] of [
    ['/api/orders/check', checkPOST],
    ['/api/orders/cancel', cancelPOST],
    ['/api/orders/verify-payment', verifyPOST],
  ] as const) {
    const req = new NextRequest(`https://shop.example.test${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-real-ip': '192.0.2.41' },
      body: JSON.stringify({ order_code: 'ORD-TEST2345', email: session.email }),
    });
    const response = await handler(req);
    assert.equal(response.status, 404, path);
    const lookup = query.mock.calls.at(-1)?.arguments[0] as any;
    assert.deepEqual(lookup.where, checkoutOrderWhere('ORD-TEST2345', session.email, null));
  }
  assert.equal(provider.mock.callCount(), 0);
});

test('owner may still check a paid account order and see only allocated delivery', async () => {
  stubSession();
  stub(prisma, '$queryRaw', async () => [{ '?column?': 1 }]);
  const order = fixture();
  order.paymentStatus = 'paid';
  order.deliveryStatus = 'delivered';
  const query = stub(prisma.order, 'findFirst', async () => order);
  const req = new NextRequest('https://shop.example.test/api/orders/check', {
    method: 'POST', headers: {
      'Content-Type': 'application/json', 'x-real-ip': '192.0.2.41',
      Authorization: `Bearer ${await createUserToken(session)}`,
    },
    body: JSON.stringify({ order_code: order.orderCode, email: order.customerEmail }),
  });
  const response = await checkPOST(req);
  assert.equal(response.status, 200);
  assert.deepEqual((query.mock.calls[0].arguments[0] as any).where,
    checkoutOrderWhere(order.orderCode, order.customerEmail, session));
  const body = await response.json();
  assert.equal(body.data.delivery_content, 'ALLOCATED-ORDER-A');
  assert.equal(JSON.stringify(body).includes('UNALLOCATED-INVENTORY-SECRET'), false);
});

test('owner may verify an already-paid order without reallocating inventory', async () => {
  stubSession();
  stub(prisma, '$queryRaw', async () => [{ '?column?': 1 }]);
  const order = fixture();
  order.paymentStatus = 'paid';
  order.deliveryStatus = 'delivered';
  const query = stub(prisma.order, 'findFirst', async () => order);
  const update = stub(prisma.order, 'update', () => { throw new Error('Must not reallocate'); });
  mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 404 }));
  const req = new NextRequest('https://shop.example.test/api/orders/verify-payment', {
    method: 'POST', headers: {
      'Content-Type': 'application/json', 'x-real-ip': '192.0.2.41',
      Authorization: `Bearer ${await createUserToken(session)}`,
    },
    body: JSON.stringify({ order_code: order.orderCode, email: order.customerEmail }),
  });
  const response = await verifyPOST(req);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.delivery_content, 'ALLOCATED-ORDER-A');
  for (const call of query.mock.calls) {
    assert.deepEqual((call.arguments[0] as any).where,
      call === query.mock.calls[0]
        ? checkoutOrderWhere(order.orderCode, order.customerEmail, session)
        : { id: order.id, ...checkoutOrderWhere(order.orderCode, order.customerEmail, session) });
  }
  assert.equal(update.mock.callCount(), 0);
});

test('owner may read an already-cancelled order through the cancellation endpoint', async () => {
  stubSession();
  stub(prisma, '$queryRaw', async () => [{ '?column?': 1 }]);
  const order = fixture();
  order.orderStatus = 'cancelled';
  order.paymentStatus = 'cancelled';
  const query = stub(prisma.order, 'findFirst', async () => order);
  const provider = mock.method(globalThis, 'fetch', () => { throw new Error('Must not contact provider'); });
  const req = new NextRequest('https://shop.example.test/api/orders/cancel', {
    method: 'POST', headers: {
      'Content-Type': 'application/json', 'x-real-ip': '192.0.2.41',
      Authorization: `Bearer ${await createUserToken(session)}`,
    },
    body: JSON.stringify({ order_code: order.orderCode, email: order.customerEmail }),
  });
  const response = await cancelPOST(req);
  assert.equal(response.status, 200);
  assert.deepEqual((query.mock.calls[0].arguments[0] as any).where,
    checkoutOrderWhere(order.orderCode, order.customerEmail, session));
  assert.equal(provider.mock.callCount(), 0);
});
