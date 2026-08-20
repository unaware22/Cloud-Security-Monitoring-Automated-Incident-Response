import { NextRequest, NextResponse } from 'next/server';
import { recordSecurityEvent } from '@/lib/security';

export async function POST(req: NextRequest) {
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
