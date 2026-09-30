import assert from 'node:assert/strict';
import test from 'node:test';
import { getIpControlLifecycleData } from '../src/lib/ip-control';

test('keeps lifecycle metadata on a block event', () => {
  const expiresAt = new Date('2026-09-30T15:30:00Z');
  assert.deepEqual(
    getIpControlLifecycleData('block', {
      blockMode: 'temporary',
      timeoutSeconds: 1800,
      expiresAt,
    }),
    { blockMode: 'temporary', timeoutSeconds: 1800, expiresAt }
  );
});

test('clears stale lifecycle metadata on an unblock event', () => {
  assert.deepEqual(
    getIpControlLifecycleData('unblock', {
      blockMode: 'permanent',
      timeoutSeconds: 1800,
      expiresAt: new Date('2026-09-30T15:30:00Z'),
    }),
    { blockMode: null, timeoutSeconds: null, expiresAt: null }
  );
});

test('does not clear existing block metadata when an update omits it', () => {
  assert.deepEqual(getIpControlLifecycleData('block', {}), {});
});
