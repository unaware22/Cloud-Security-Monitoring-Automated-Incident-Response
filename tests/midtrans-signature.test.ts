import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { verifyMidtransSignature } from '../src/lib/midtrans';

const sign = (orderId: string, statusCode: string, grossAmount: string, key: string) =>
  crypto.createHash('sha512').update(`${orderId}${statusCode}${grossAmount}${key}`).digest('hex');

const withServerKey = (key: string | undefined, fn: () => void) => {
  const previous = process.env.MIDTRANS_SERVER_KEY;
  if (key === undefined) delete process.env.MIDTRANS_SERVER_KEY;
  else process.env.MIDTRANS_SERVER_KEY = key;
  try { fn(); } finally {
    if (previous === undefined) delete process.env.MIDTRANS_SERVER_KEY;
    else process.env.MIDTRANS_SERVER_KEY = previous;
  }
};

const base = { orderId: 'ORD-TEST1234', statusCode: '200', grossAmount: '35000.00' };

test('accepts a signature made with the server key (any hex case)', () => {
  withServerKey('SB-Mid-server-test-key', () => {
    const signatureKey = sign(base.orderId, base.statusCode, base.grossAmount, 'SB-Mid-server-test-key');
    assert.equal(verifyMidtransSignature({ ...base, signatureKey }), true);
    assert.equal(verifyMidtransSignature({ ...base, signatureKey: signatureKey.toUpperCase() }), true);
  });
});

test('rejects a wrong signature and a tampered amount', () => {
  withServerKey('SB-Mid-server-test-key', () => {
    const signatureKey = sign(base.orderId, base.statusCode, base.grossAmount, 'SB-Mid-server-test-key');
    assert.equal(verifyMidtransSignature({ ...base, signatureKey: 'a'.repeat(128) }), false);
    assert.equal(verifyMidtransSignature({ ...base, grossAmount: '1000.00', signatureKey }), false);
  });
});

test('rejects everything when the server key is missing (no forgeable empty-key hash)', () => {
  withServerKey(undefined, () => {
    const forged = sign(base.orderId, base.statusCode, base.grossAmount, '');
    assert.equal(verifyMidtransSignature({ ...base, signatureKey: forged }), false);
  });
});

test('rejects non-string fields instead of throwing', () => {
  withServerKey('SB-Mid-server-test-key', () => {
    assert.equal(verifyMidtransSignature({ ...base, signatureKey: 12345 as any }), false);
    assert.equal(verifyMidtransSignature({ ...base, grossAmount: 35000 as any, signatureKey: 'x' }), false);
  });
});
