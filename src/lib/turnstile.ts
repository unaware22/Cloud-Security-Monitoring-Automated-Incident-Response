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

/**
 * Cloudflare requires every Turnstile token to be verified by the server.
 * Network/provider failures fail closed whenever a real secret is configured.
 */
export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string
): Promise<TurnstileVerificationResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY || '';
  if (!secret || !token) {
    return { success: false, errorCodes: ['missing-input'] };
  }

  const formData = new URLSearchParams({ secret, response: token });
  if (remoteIp && remoteIp !== '127.0.0.1') {
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
      return { success: false, errorCodes };
    }

    if (result.action && result.action !== 'checkout') {
      return { success: false, errorCodes: [...errorCodes, 'action-mismatch'] };
    }

    const expectedHostname = (process.env.TURNSTILE_EXPECTED_HOSTNAME || '').trim().toLowerCase();
    if (expectedHostname && result.hostname?.toLowerCase() !== expectedHostname) {
      return { success: false, errorCodes: [...errorCodes, 'hostname-mismatch'] };
    }

    return { success: true, errorCodes: [] };
  } catch (error) {
    console.error('[Turnstile Siteverify Error]:', error);
    return { success: false, errorCodes: ['siteverify-unavailable'] };
  }
}
