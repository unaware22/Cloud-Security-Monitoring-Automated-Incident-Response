import { NextRequest, NextResponse } from 'next/server';
import { recordSecurityEvent } from '@/lib/security';

function isAuthorized(req: NextRequest): boolean {
  const expectedToken = process.env.SECURITY_EVENT_RELAY_TOKEN;
  const suppliedToken = req.headers.get('x-security-event-token');

  return Boolean(
    expectedToken &&
      expectedToken.length >= 32 &&
      suppliedToken &&
      suppliedToken === expectedToken
  );
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    // Avoid advertising a useful endpoint to internet scanners.
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  try {
    const body = await req.json();
    const {
      eventType,
      severity,
      ipAddress,
      method,
      endpoint,
      userAgent,
      payloadSnippet,
      statusCode,
      description,
      requestId,
    } = body;

    await recordSecurityEvent({
      eventType: eventType || 'sensitive_path_scan',
      severity: severity || 'warning',
      ipAddress: ipAddress || '127.0.0.1',
      method: method || 'GET',
      endpoint: endpoint || '/',
      userAgent: userAgent || 'Unknown',
      payloadSnippet: payloadSnippet || '',
      statusCode: Number(statusCode) || 400,
      description: description || '',
      requestId,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}
