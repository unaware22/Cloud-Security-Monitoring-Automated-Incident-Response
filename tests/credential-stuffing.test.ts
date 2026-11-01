import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordCredentialFailure } from '../src/lib/credential-stuffing-detector';

const at = (iso: string) => Date.parse(iso);

test('five distinct accounts are detected even when the series crosses a fixed 10-minute boundary', () => {
  // Timeline from the AWS log of 2026-11-01: a brute-force run at 16:21
  // opened the old fixed window, and the 5th email at 16:31:12 reset it to 1.
  const ip = '198.51.100.10';
  for (const t of ['16:21:36', '16:21:41', '16:21:46', '16:21:51', '16:21:56']) {
    recordCredentialFailure(ip, 'acct-brute', at(`2026-11-01T${t}Z`));
  }
  const series: Array<[string, string]> = [
    ['16:29:17', 'acct-2'],
    ['16:30:04', 'acct-3'],
    ['16:30:41', 'acct-4'],
    ['16:31:12', 'acct-5'],
  ];
  const results = series.map(([t, acct]) => recordCredentialFailure(ip, acct, at(`2026-11-01T${t}Z`)));
  const last = results.at(-1)!;

  // acct-brute was last seen at 16:21:56, 9m16s before 16:31:12, so it is
  // still inside the sliding window: the 5th distinct account fires here
  // (the old fixed window reported distinct_accounts=1 at this point).
  assert.deepEqual(results.map((r) => r.distinctAccountCount), [2, 3, 4, 5]);
  assert.equal(last.credentialStuffingDetected, true);

  // The next account (acct-brute is 9m53s old, still counted): the series
  // keeps counting instead of starting over at 1.
  const sixth = recordCredentialFailure(ip, 'acct-6', at('2026-11-01T16:31:49Z'));
  assert.equal(sixth.distinctAccountCount, 6);
  assert.equal(sixth.credentialStuffingDetected, false); // already alerted in this window
  assert.equal(sixth.credentialStuffingActive, true);
});

test('five new emails within two minutes trigger once, then stay quiet for the window', () => {
  const ip = '198.51.100.20';
  const base = at('2026-11-01T17:00:00Z');
  const results = [1, 2, 3, 4, 5, 6].map((n) =>
    recordCredentialFailure(ip, `user-${n}`, base + n * 30_000)
  );
  assert.deepEqual(results.map((r) => r.distinctAccountCount), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(results.map((r) => r.credentialStuffingDetected), [false, false, false, false, true, false]);
  assert.equal(results[5].credentialStuffingActive, true);
});

test('a slow attacker spreading accounts over more than 10 minutes is not flagged', () => {
  const ip = '198.51.100.30';
  const base = at('2026-11-01T18:00:00Z');
  const results = [0, 1, 2, 3, 4].map((n) =>
    recordCredentialFailure(ip, `slow-${n}`, base + n * 3 * 60_000)
  );
  assert.deepEqual(results.map((r) => r.distinctAccountCount), [1, 2, 3, 4, 4]);
  assert.equal(results.some((r) => r.credentialStuffingDetected), false);
});

test('brute force on one account still triggers at five failures', () => {
  const ip = '198.51.100.40';
  const base = at('2026-11-01T19:00:00Z');
  const results = [1, 2, 3, 4, 5].map((n) => recordCredentialFailure(ip, 'victim', base + n * 5_000));
  assert.equal(results[4].failuresForAccount, 5);
  assert.equal(results[4].bruteForceDetected, true);
  assert.equal(results[4].distinctAccountCount, 1);
});
