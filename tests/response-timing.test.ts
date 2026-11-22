import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waitForResponseFloor } from '../src/lib/response-timing';

test('a fast answer is held until the floor is reached', async () => {
  const startedAt = Date.now();
  await waitForResponseFloor(startedAt, 120, 0);
  assert.ok(Date.now() - startedAt >= 115, `waited ${Date.now() - startedAt} ms`);
});

test('a slow answer is not delayed further', async () => {
  const startedAt = Date.now() - 500; // work already took longer than the floor
  const before = Date.now();
  await waitForResponseFloor(startedAt, 120, 0);
  assert.ok(Date.now() - before < 30, `extra wait ${Date.now() - before} ms`);
});

test('jitter adds between 0 and jitterMs to the floor', async () => {
  const startedAt = Date.now();
  await waitForResponseFloor(startedAt, 100, 100, () => 0.5); // floor 100 + 50
  const waited = Date.now() - startedAt;
  assert.ok(waited >= 145 && waited < 260, `waited ${waited} ms`);
});
