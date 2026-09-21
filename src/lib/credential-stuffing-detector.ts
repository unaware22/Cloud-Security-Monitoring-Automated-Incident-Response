const DETECTION_WINDOW_MS = 10 * 60 * 1000;
const CREDENTIAL_STUFFING_ACCOUNT_THRESHOLD = 5;
const ACCOUNT_TAKEOVER_IP_THRESHOLD = 5;
const SUSPICIOUS_SUCCESS_THRESHOLD = 3;

interface DetectionBucket {
  values: Set<string>;
  resetAt: number;
  alerted: boolean;
}

interface FailureBucket {
  count: number;
  resetAt: number;
  alerted: boolean;
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

const accountsByIp = new Map<string, DetectionBucket>();
const ipsByAccount = new Map<string, DetectionBucket>();
const failuresByIpAndAccount = new Map<string, FailureBucket>();

function getBucket(store: Map<string, DetectionBucket>, key: string, now: number): DetectionBucket {
  const existing = store.get(key);
  if (existing && existing.resetAt > now) return existing;

  const bucket: DetectionBucket = {
    values: new Set<string>(),
    resetAt: now + DETECTION_WINDOW_MS,
    alerted: false,
  };
  store.set(key, bucket);
  return bucket;
}

function getFailureBucket(key: string, now: number): FailureBucket {
  const existing = failuresByIpAndAccount.get(key);
  if (existing && existing.resetAt > now) return existing;

  const bucket: FailureBucket = {
    count: 0,
    resetAt: now + DETECTION_WINDOW_MS,
    alerted: false,
  };
  failuresByIpAndAccount.set(key, bucket);
  return bucket;
}

export function recordCredentialFailure(
  ipAddress: string,
  accountRef: string
): CredentialFailureResult {
  const now = Date.now();
  const ipBucket = getBucket(accountsByIp, ipAddress, now);
  const accountBucket = getBucket(ipsByAccount, accountRef, now);
  const failureBucket = getFailureBucket(`${ipAddress}:${accountRef}`, now);

  ipBucket.values.add(accountRef);
  accountBucket.values.add(ipAddress);
  failureBucket.count += 1;

  const credentialStuffingDetected =
    ipBucket.values.size >= CREDENTIAL_STUFFING_ACCOUNT_THRESHOLD && !ipBucket.alerted;
  const credentialStuffingActive =
    ipBucket.values.size >= CREDENTIAL_STUFFING_ACCOUNT_THRESHOLD;
  const bruteForceDetected =
    failureBucket.count >= CREDENTIAL_STUFFING_ACCOUNT_THRESHOLD && !failureBucket.alerted;
  const bruteForceActive =
    failureBucket.count >= CREDENTIAL_STUFFING_ACCOUNT_THRESHOLD;
  const accountTakeoverDetected =
    accountBucket.values.size >= ACCOUNT_TAKEOVER_IP_THRESHOLD && !accountBucket.alerted;

  if (credentialStuffingDetected) ipBucket.alerted = true;
  if (bruteForceDetected) failureBucket.alerted = true;
  if (accountTakeoverDetected) accountBucket.alerted = true;

  return {
    credentialStuffingDetected,
    credentialStuffingActive,
    bruteForceDetected,
    bruteForceActive,
    accountTakeoverDetected,
    distinctAccountCount: ipBucket.values.size,
    distinctIpCount: accountBucket.values.size,
    failuresForAccount: failureBucket.count,
  };
}

export function assessSuccessfulLogin(
  ipAddress: string,
  accountRef: string
): LoginSuccessAssessment {
  const now = Date.now();
  const ipBucket = accountsByIp.get(ipAddress);
  const accountBucket = ipsByAccount.get(accountRef);
  const distinctAccountCount = ipBucket && ipBucket.resetAt > now ? ipBucket.values.size : 0;
  const distinctIpCount = accountBucket && accountBucket.resetAt > now ? accountBucket.values.size : 0;

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
  for (const [key, bucket] of accountsByIp) {
    if (bucket.resetAt <= now) accountsByIp.delete(key);
  }
  for (const [key, bucket] of ipsByAccount) {
    if (bucket.resetAt <= now) ipsByAccount.delete(key);
  }
  for (const [key, bucket] of failuresByIpAndAccount) {
    if (bucket.resetAt <= now) failuresByIpAndAccount.delete(key);
  }
}, 60_000);

cleanupTimer.unref?.();
