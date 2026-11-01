const DETECTION_WINDOW_MS = 10 * 60 * 1000;
const CREDENTIAL_STUFFING_ACCOUNT_THRESHOLD = 5;
const ACCOUNT_TAKEOVER_IP_THRESHOLD = 5;
const SUSPICIOUS_SUCCESS_THRESHOLD = 3;

// Sliding windows: every check counts what happened in the last
// DETECTION_WINDOW_MS before *this* attempt. A fixed window anchored at the
// first failure let a series straddle the boundary (e.g. 4 accounts at the end
// of one window and the 5th just after it reset the count back to 1).

interface DistinctBucket {
  lastSeen: Map<string, number>; // value -> last time it was seen
  alertedUntil: number; // no repeat alert for this key before this time
}

interface FailureBucket {
  times: number[];
  alertedUntil: number;
}

export interface CredentialFailureResult {
  credentialStuffingDetected: boolean;
  credentialStuffingActive: boolean;
  bruteForceDetected: boolean;
  bruteForceActive: boolean;
  accountTakeoverDetected: boolean;
  distinctAccountCount: number;
  distinctIpCount: number;
  failuresForAccount: number;
}

export interface LoginSuccessAssessment {
  suspicious: boolean;
  credentialStuffingActive: boolean;
  distinctAccountCount: number;
  distinctIpCount: number;
}

const accountsByIp = new Map<string, DistinctBucket>();
const ipsByAccount = new Map<string, DistinctBucket>();
const failuresByIpAndAccount = new Map<string, FailureBucket>();

function pruneDistinct(bucket: DistinctBucket, now: number): void {
  for (const [value, seenAt] of bucket.lastSeen) {
    if (now - seenAt >= DETECTION_WINDOW_MS) bucket.lastSeen.delete(value);
  }
}

function touchDistinct(
  store: Map<string, DistinctBucket>,
  key: string,
  value: string,
  now: number
): DistinctBucket {
  let bucket = store.get(key);
  if (!bucket) {
    bucket = { lastSeen: new Map(), alertedUntil: 0 };
    store.set(key, bucket);
  }
  pruneDistinct(bucket, now);
  bucket.lastSeen.set(value, now);
  return bucket;
}

function activeDistinctCount(
  store: Map<string, DistinctBucket>,
  key: string,
  now: number
): number {
  const bucket = store.get(key);
  if (!bucket) return 0;
  pruneDistinct(bucket, now);
  return bucket.lastSeen.size;
}

function touchFailures(key: string, now: number): FailureBucket {
  let bucket = failuresByIpAndAccount.get(key);
  if (!bucket) {
    bucket = { times: [], alertedUntil: 0 };
    failuresByIpAndAccount.set(key, bucket);
  }
  bucket.times = bucket.times.filter((t) => now - t < DETECTION_WINDOW_MS);
  bucket.times.push(now);
  return bucket;
}

// An alert fires once when the threshold is crossed, then stays quiet for one
// window so a continuing attack does not flood Wazuh with duplicate events.
function shouldAlert(count: number, threshold: number, bucket: { alertedUntil: number }, now: number) {
  if (count < threshold || now < bucket.alertedUntil) return false;
  bucket.alertedUntil = now + DETECTION_WINDOW_MS;
  return true;
}

export function recordCredentialFailure(
  ipAddress: string,
  accountRef: string,
  now: number = Date.now()
): CredentialFailureResult {
  const ipBucket = touchDistinct(accountsByIp, ipAddress, accountRef, now);
  const accountBucket = touchDistinct(ipsByAccount, accountRef, ipAddress, now);
  const failureBucket = touchFailures(`${ipAddress}:${accountRef}`, now);

  const distinctAccountCount = ipBucket.lastSeen.size;
  const distinctIpCount = accountBucket.lastSeen.size;
  const failuresForAccount = failureBucket.times.length;

  return {
    credentialStuffingDetected: shouldAlert(
      distinctAccountCount, CREDENTIAL_STUFFING_ACCOUNT_THRESHOLD, ipBucket, now
    ),
    credentialStuffingActive: distinctAccountCount >= CREDENTIAL_STUFFING_ACCOUNT_THRESHOLD,
    bruteForceDetected: shouldAlert(
      failuresForAccount, CREDENTIAL_STUFFING_ACCOUNT_THRESHOLD, failureBucket, now
    ),
    bruteForceActive: failuresForAccount >= CREDENTIAL_STUFFING_ACCOUNT_THRESHOLD,
    accountTakeoverDetected: shouldAlert(
      distinctIpCount, ACCOUNT_TAKEOVER_IP_THRESHOLD, accountBucket, now
    ),
    distinctAccountCount,
    distinctIpCount,
    failuresForAccount,
  };
}

export function assessSuccessfulLogin(
  ipAddress: string,
  accountRef: string,
  now: number = Date.now()
): LoginSuccessAssessment {
  const distinctAccountCount = activeDistinctCount(accountsByIp, ipAddress, now);
  const distinctIpCount = activeDistinctCount(ipsByAccount, accountRef, now);

  return {
    suspicious:
      distinctAccountCount >= SUSPICIOUS_SUCCESS_THRESHOLD ||
      distinctIpCount >= SUSPICIOUS_SUCCESS_THRESHOLD,
    credentialStuffingActive:
      distinctAccountCount >= CREDENTIAL_STUFFING_ACCOUNT_THRESHOLD,
    distinctAccountCount,
    distinctIpCount,
  };
}

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const store of [accountsByIp, ipsByAccount]) {
    for (const [key, bucket] of store) {
      pruneDistinct(bucket, now);
      if (bucket.lastSeen.size === 0 && bucket.alertedUntil <= now) store.delete(key);
    }
  }
  for (const [key, bucket] of failuresByIpAndAccount) {
    bucket.times = bucket.times.filter((t) => now - t < DETECTION_WINDOW_MS);
    if (bucket.times.length === 0 && bucket.alertedUntil <= now) {
      failuresByIpAndAccount.delete(key);
    }
  }
}, 60_000);

cleanupTimer.unref?.();
