import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isConfirmedMidtransPayment,
  type MidtransStatusResponse,
} from '../src/lib/midtrans';

const confirmed: MidtransStatusResponse = {
  status_code: '200',
  status_message: 'Success',
  transaction_id: 'transaction-1',
  order_id: 'ORDER-1',
  gross_amount: '30750.00',
  payment_type: 'bank_transfer',
  transaction_time: '2026-10-01 10:00:00',
  transaction_status: 'settlement',
};

test('accepts a settled transaction for the same order and amount', () => {
  assert.equal(isConfirmedMidtransPayment(confirmed, 'ORDER-1', 30750), true);
});

test('never releases delivery for a pending, mismatched, or challenged transaction', () => {
  assert.equal(
    isConfirmedMidtransPayment({ ...confirmed, transaction_status: 'pending' }, 'ORDER-1', 30750),
    false
  );
  assert.equal(isConfirmedMidtransPayment(confirmed, 'ORDER-2', 30750), false);
  assert.equal(isConfirmedMidtransPayment(confirmed, 'ORDER-1', 30751), false);
  assert.equal(
    isConfirmedMidtransPayment({ ...confirmed, fraud_status: 'challenge' }, 'ORDER-1', 30750),
    false
  );
  assert.equal(
    isConfirmedMidtransPayment({ ...confirmed, status_code: '201' }, 'ORDER-1', 30750),
    false
  );
});
