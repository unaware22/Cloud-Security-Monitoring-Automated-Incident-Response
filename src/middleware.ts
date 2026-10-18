import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import {
  DEVICE_COOKIE_MAX_AGE_SECONDS,
  DEVICE_COOKIE_NAME,
  DEVICE_HEADER_NAME,
  issueDeviceCookie,
  verifyDeviceCookie,
} from '@/lib/device-id';

const SENSITIVE_PATH_PATTERNS = [
  /^\/\.env/i,
  /^\/\.git/i,
  /^\/\.aws/i,
  /^\/\.svn/i,
  /^\/\.DS_Store/i,
  /^\/wp-admin/i,
  /^\/wp-login/i,
  /^\/phpmyadmin/i,
  /^\/pma/i,
  /^\/adminer/i,
  /^\/backup\.(zip|sql|tar|gz|bak)/i,
  /^\/db_backup/i,
  /^\/config\.(json|yml|yaml|ini|php)/i,
  /^\/eval-stdin/i,
  /^\/cgi-bin/i,
  /^\/actuator/i,
  /^\/telescope/i,
  /^\/debug\/default\/view/i,
];

const SQLI_PATTERNS = [
  /(\b(select|union|insert|delete|update|drop|truncate|alter|create|load_file|outfile)\b[\s\S]+\b(from|into|table|database|schema)\b)/i,
  /(\bunion\b[\s\S]+\bselect\b)/i,
  /((\%27)|(')|(\-\-)|(\%23)|(#))(\s)*(or|and|exec|execute|union)\b/i,
  /(\b(or|and)\b\s+[\w\d'"]+\s*=\s*[\w\d'"]+)/i,
  /(\b(sleep|benchmark|waitfor|pg_sleep)\s*\(\s*\d+\s*\))/i,
  /('[\s\S]*--)|(;[\s\S]*--)/i,
];

const XSS_PATTERNS = [
  /<script[\s\S]*?>[\s\S]*?<\/script>/i,
  /<script[\s\S]*?>/i,
  /javascript\s*:/i,
  /onload\s*=\s*['"]?[^'"]*['"]?/i,
  /onerror\s*=\s*['"]?[^'"]*['"]?/i,
  /<iframe[\s\S]*?>/i,
  /<img[\s\S]+?onerror/i,
  /<svg[\s\S]+?onload/i,
  /document\.cookie/i,
];

const ADMIN_TOKEN_ISSUER = 'saladinshop';
const ADMIN_TOKEN_AUDIENCE = 'saladinshop-admin';

function getJwtSecret(): Uint8Array | null {
  const secret = process.env.ADMIN_JWT_SECRET;
  return secret && secret.length >= 32 ? new TextEncoder().encode(secret) : null;
}

function getSecurityRelayToken(): string | null {
  const token = process.env.SECURITY_EVENT_RELAY_TOKEN;
  return token && token.length >= 32 ? token : null;
}

// The Edge runtime cannot reach Prisma, so bans are looked up through a
// token-protected internal endpoint and cached briefly per process.
const DEVICE_CACHE_TTL_MS = 10_000;
const BANNED_LOG_THROTTLE_MS = 60_000;
const deviceBanCache = new Map<string, { banned: boolean; expiresAt?: string; checkedAt: number }>();
const bannedLogThrottle = new Map<string, number>();

async function lookupDeviceBan(
  req: NextRequest,
  deviceId: string,
  ip: string,
  relayToken: string | null
): Promise<{ banned: boolean; expiresAt?: string }> {
  const now = Date.now();
  const cached = deviceBanCache.get(deviceId);
  if (cached && now - cached.checkedAt < DEVICE_CACHE_TTL_MS) {
    if (!cached.banned || (cached.expiresAt && new Date(cached.expiresAt).getTime() > now)) {
      return cached;
    }
  }
  if (!relayToken) return { banned: false };

  try {
    const url = new URL('/api/internal/security/device-check', req.url);
    url.searchParams.set('device', deviceId);
    url.searchParams.set('ip', ip);
    const response = await fetch(url, {
      headers: { 'x-security-event-token': relayToken },
      cache: 'no-store',
    });
    if (!response.ok) return { banned: false };
    const result = (await response.json()) as { banned?: boolean; expiresAt?: string };
    const entry = { banned: Boolean(result.banned), expiresAt: result.expiresAt, checkedAt: now };
    deviceBanCache.set(deviceId, entry);
    if (deviceBanCache.size > 5000) deviceBanCache.clear();
    return entry;
  } catch {
    // Fail open: never lock customers out because the check itself failed.
    return { banned: false };
  }
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const forwardedFor = req.headers.get('x-forwarded-for');
  const ip =
    req.headers.get('x-real-ip') ||
    forwardedFor?.split(',').at(-1)?.trim() ||
    '127.0.0.1';
  const userAgent = req.headers.get('user-agent') || 'Unknown';
  const requestId = `req-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
  const relayToken = getSecurityRelayToken();

  // Skip static assets and internal Next.js requests
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/static')
  ) {
    return NextResponse.next();
  }

  // Internal, token-protected endpoints are called by this middleware itself.
  if (pathname.startsWith('/api/internal/') || pathname === '/api/security-log-relay') {
    return NextResponse.next();
  }

  // 0. Signed device cookie: identifies the browser even when the IP changes
  // (VPN, mobile data). An invalid or missing cookie simply yields a new device.
  let deviceId = await verifyDeviceCookie(req.cookies.get(DEVICE_COOKIE_NAME)?.value);
  let newDeviceCookie: string | null = null;
  if (!deviceId) {
    const issued = await issueDeviceCookie();
    if (issued) {
      deviceId = issued.deviceId;
      newDeviceCookie = issued.cookieValue;
    }
  }

  const withDevice = (res: NextResponse): NextResponse => {
    if (newDeviceCookie) {
      res.cookies.set(DEVICE_COOKIE_NAME, newDeviceCookie, {
        httpOnly: true,
        sameSite: 'lax',
        secure: req.headers.get('x-forwarded-proto') === 'https',
        path: '/',
        maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
      });
    }
    return res;
  };

  if (deviceId && !newDeviceCookie) {
    const ban = await lookupDeviceBan(req, deviceId, ip, relayToken);
    if (ban.banned) {
      const retryAfter = ban.expiresAt
        ? Math.max(1, Math.ceil((new Date(ban.expiresAt).getTime() - Date.now()) / 1000))
        : 1800;

      const lastLogged = bannedLogThrottle.get(deviceId) ?? 0;
      if (Date.now() - lastLogged > BANNED_LOG_THROTTLE_MS) {
        bannedLogThrottle.set(deviceId, Date.now());
        if (bannedLogThrottle.size > 5000) bannedLogThrottle.clear();
        try {
          await fetch(new URL('/api/security-log-relay', req.url), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(relayToken ? { 'x-security-event-token': relayToken } : {}),
            },
            body: JSON.stringify({
              eventType: 'banned_device_request',
              severity: 'medium',
              ipAddress: ip,
              method: req.method,
              endpoint: pathname,
              userAgent,
              payloadSnippet: `device_banned_until=${ban.expiresAt ?? 'unknown'}`,
              statusCode: 403,
              description: 'Request from a temporarily banned device (possible IP/VPN change)',
              requestId,
              deviceId,
            }),
          }).catch(() => {});
        } catch {}
      }

      return new NextResponse(
        JSON.stringify({
          error: 'Forbidden',
          message: 'Akses perangkat ini dibatasi sementara karena aktivitas mencurigakan. Coba lagi nanti.',
          request_id: requestId,
        }),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfter),
            'x-request-id': requestId,
          },
        }
      );
    }
  }

  // Forward the verified device id to route handlers (overrides any client-sent header).
  const forwardedHeaders = new Headers(req.headers);
  forwardedHeaders.delete(DEVICE_HEADER_NAME);
  if (deviceId) forwardedHeaders.set(DEVICE_HEADER_NAME, deviceId);

  // 1. Check for Sensitive Path Scanning
  const isSensitivePath = SENSITIVE_PATH_PATTERNS.some((p) => p.test(pathname));
  if (isSensitivePath) {
    // Notify security logger endpoint via internal fetch or trigger event
    try {
      await fetch(new URL('/api/security-log-relay', req.url), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(relayToken ? { 'x-security-event-token': relayToken } : {}),
        },
        body: JSON.stringify({
          eventType: 'sensitive_path_scan',
          severity: 'warning',
          ipAddress: ip,
          method: req.method,
          endpoint: pathname,
          userAgent,
          payloadSnippet: `Target path: ${pathname}`,
          statusCode: 404,
          description: 'Reconnaissance probe for sensitive files or admin portals',
          requestId,
          deviceId,
        }),
      }).catch(() => {});
    } catch {}

    return withDevice(
      new NextResponse('Not Found', {
        status: 404,
        headers: {
          'x-request-id': requestId,
          'Content-Type': 'text/plain',
        },
      })
    );
  }

  // 2. Check for SQLi / XSS in Query String
  if (search) {
    const isSQLi = SQLI_PATTERNS.some((p) => p.test(search));
    const isXSS = XSS_PATTERNS.some((p) => p.test(search));

    if (isSQLi || isXSS) {
      const eventType = isSQLi ? 'sql_injection_attempt' : 'xss_attempt';
      const severity = isSQLi ? 'high' : 'medium';

      try {
        await fetch(new URL('/api/security-log-relay', req.url), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(relayToken ? { 'x-security-event-token': relayToken } : {}),
        },
          body: JSON.stringify({
            eventType,
            severity,
            ipAddress: ip,
            method: req.method,
            endpoint: `${pathname}${search}`,
            userAgent,
            payloadSnippet: decodeURIComponent(search).substring(0, 300),
            statusCode: 400,
            description: `Suspicious pattern detected in query parameters (${eventType})`,
            requestId,
            deviceId,
          }),
        }).catch(() => {});
      } catch {}

      return withDevice(
        new NextResponse(
          JSON.stringify({
            error: 'Bad Request',
            message: 'Malicious or invalid request query parameters detected',
            request_id: requestId,
          }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'x-request-id': requestId,
            },
          }
        )
      );
    }
  }

  // 3. Admin Route Authentication Guard (for /admin pages except /admin/login)
  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    const token = req.cookies.get('admin_session_token')?.value;
    let isValid = false;

    if (token) {
      try {
        const jwtSecret = getJwtSecret();
        if (!jwtSecret) throw new Error('ADMIN_JWT_SECRET is not configured');
        const { payload } = await jwtVerify(token, jwtSecret, {
          issuer: ADMIN_TOKEN_ISSUER,
          audience: ADMIN_TOKEN_AUDIENCE,
        });
        if (typeof payload.sessionVersion !== 'number') {
          throw new Error('Legacy or invalid admin session');
        }
        isValid = true;
      } catch {
        isValid = false;
      }
    }

    if (!isValid) {
      const loginUrl = new URL('/admin/login', req.url);
      loginUrl.searchParams.set('redirect', pathname);
      return withDevice(NextResponse.redirect(loginUrl));
    }
  }

  // 4. Set Response with Security Headers
  const response = withDevice(NextResponse.next({ request: { headers: forwardedHeaders } }));
  response.headers.set('x-request-id', requestId);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains'
  );

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
