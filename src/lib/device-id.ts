// Edge-safe helpers (Web Crypto only, no Prisma) for the signed device cookie.
// The cookie is a random id plus an HMAC, so a client cannot forge or guess
// another device's id. Clearing the cookie yields a fresh, unbanned device;
// that limitation is intentional and documented in the thesis guide.

export const DEVICE_COOKIE_NAME = 'sv_did';
export const DEVICE_HEADER_NAME = 'x-device-id';
export const DEVICE_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 3600;

const encoder = new TextEncoder();

function getDeviceSecret(): string | null {
  const secret =
    process.env.DEVICE_COOKIE_SECRET ||
    process.env.CUSTOMER_JWT_SECRET ||
    process.env.ADMIN_JWT_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(deviceId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(`device-cookie:${secret}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return toBase64Url(await crypto.subtle.sign('HMAC', key, encoder.encode(deviceId)));
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Returns the device id when the cookie carries a valid signature, else null. */
export async function verifyDeviceCookie(value: string | undefined): Promise<string | null> {
  if (!value) return null;
  const secret = getDeviceSecret();
  if (!secret) return null;

  const separator = value.indexOf('.');
  if (separator <= 0) return null;
  const deviceId = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!UUID_PATTERN.test(deviceId)) return null;

  const expected = await sign(deviceId, secret);
  return timingSafeEqual(signature, expected) ? deviceId : null;
}

/** Creates a new device id and the signed cookie value that carries it. */
export async function issueDeviceCookie(): Promise<{ deviceId: string; cookieValue: string } | null> {
  const secret = getDeviceSecret();
  if (!secret) return null;
  const deviceId = crypto.randomUUID();
  return { deviceId, cookieValue: `${deviceId}.${await sign(deviceId, secret)}` };
}

/** Short non-secret reference for logs and the admin UI. */
export async function deviceReference(deviceId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`ref:${deviceId}`));
  return Array.from(new Uint8Array(digest).slice(0, 6))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
