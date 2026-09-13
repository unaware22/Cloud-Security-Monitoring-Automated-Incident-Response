import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

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
        }),
      }).catch(() => {});
    } catch {}

    return new NextResponse('Not Found', {
      status: 404,
      headers: {
        'x-request-id': requestId,
        'Content-Type': 'text/plain',
      },
    });
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
          }),
        }).catch(() => {});
      } catch {}

      return new NextResponse(
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
      return NextResponse.redirect(loginUrl);
    }
  }

  // 4. Set Response with Security Headers
  const response = NextResponse.next();
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
