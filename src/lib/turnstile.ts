const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

type TurnstileResponse = {
  success: boolean;
  hostname?: string;
  action?: string;
  'error-codes'?: string[];
};

export type TurnstileVerificationResult = {
  success: boolean;
  errorCodes: string[];
};

function getExpectedHostnames(): Set<string> {
  const configuredHostnames = [
    process.env.TURNSTILE_EXPECTED_HOSTNAMES,
    process.env.TURNSTILE_EXPECTED_HOSTNAME,
  ]
    .filter(Boolean)
    .join(',');

  return new Set(
    configuredHostnames
      .split(',')
      .map((hostname) => hostname.trim().toLowerCase().replace(/\.$/, ''))
      .filter(Boolean)
  );
}

function hasConfiguredValue(value: string): boolean {
  return Boolean(value && !value.includes('REPLACE_ME'));
}

export function getTurnstileConfigurationStatus(): {
  enabled: boolean;
  misconfigured: boolean;
} {
  const secret = process.env.TURNSTILE_SECRET_KEY || '';
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';
  const secretConfigured = hasConfiguredValue(secret);
  const siteKeyConfigured = hasConfiguredValue(siteKey);

  return {
    enabled: secretConfigured && siteKeyConfigured,
    misconfigured: secretConfigured !== siteKeyConfigured,
  };
}

function isPrivateOrLocalIp(ip?: string): boolean {
  if (!ip) return true;
  const cleanIp = ip.trim().toLowerCase();
  if (
    cleanIp === '127.0.0.1' ||
    cleanIp === '::1' ||
    cleanIp === 'localhost' ||
    cleanIp === 'unknown'
  ) {
    return true;
  }
  // 10.0.0.0/8
  if (/^10\./.test(cleanIp)) return true;
  // 172.16.0.0/12 (172.16.x - 172.31.x)
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(cleanIp)) return true;
  // 192.168.0.0/16
  if (/^192\.168\./.test(cleanIp)) return true;
  // Carrier-grade NAT / link-local / loopback
  if (/^(169\.254|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7]))\./.test(cleanIp)) return true;
  return false;
}

function matchesTurnstileAction(
  resultAction: string | undefined,
  expectedAction: string | string[]
): boolean {
  if (!resultAction) {
    return true;
  }

  const normalize = (act: string) =>
    act
      .toLowerCase()
      .replace(/[-_]/g, '')
      .replace(/^user/, '');

  const normResult = normalize(resultAction);
  const targets = Array.isArray(expectedAction) ? expectedAction : [expectedAction];

  return targets.some((target) => {
    if (!target) return true;
    if (resultAction.toLowerCase() === target.toLowerCase()) return true;
    if (normResult === normalize(target)) return true;
    return false;
  });
}

/**
 * Cloudflare requires every Turnstile token to be verified by the server.
 * Network/provider failures fail closed whenever a real secret is configured.
 */
export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string,
  expectedAction: string | string[] = 'checkout'
): Promise<TurnstileVerificationResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY || '';
  if (!secret || !token) {
    return { success: false, errorCodes: ['missing-input'] };
  }

  const formData = new URLSearchParams({ secret, response: token });
  // Only forward public client IPs. Sending private IPs (e.g. EC2/Docker 172.x) causes Cloudflare to reject with invalid-remoteip.
  if (remoteIp && !isPrivateOrLocalIp(remoteIp)) {
    formData.set('remoteip', remoteIp);
  }

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData,
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return { success: false, errorCodes: [`siteverify-http-${response.status}`] };
    }

    const result = (await response.json()) as TurnstileResponse;
    const errorCodes = result['error-codes'] || [];
    if (!result.success) {
      console.warn('[Turnstile] Verification returned unsuccessful:', errorCodes);
      return { success: false, errorCodes };
    }

    if (!matchesTurnstileAction(result.action, expectedAction)) {
      console.warn(
        `[Turnstile] Action mismatch: received "${result.action}", expected "${JSON.stringify(expectedAction)}"`
      );
      return { success: false, errorCodes: [...errorCodes, 'action-mismatch'] };
    }

    const expectedHostnames = getExpectedHostnames();
    const verifiedHostname = (result.hostname || '')
      .trim()
      .toLowerCase()
      .replace(/\.$/, '');
    if (expectedHostnames.size > 0 && !expectedHostnames.has(verifiedHostname)) {
      console.warn(
        `[Turnstile] Hostname mismatch: received "${verifiedHostname}", expected "${Array.from(expectedHostnames).join(',')}"`
      );
      return { success: false, errorCodes: [...errorCodes, 'hostname-mismatch'] };
    }

    return { success: true, errorCodes: [] };
  } catch (error) {
    console.error('[Turnstile Siteverify Error]:', error);
    return { success: false, errorCodes: ['siteverify-unavailable'] };
  }
}
