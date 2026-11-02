import { recordSecurityEvent } from './security';

export type VoucherRejectReason =
  | 'invalid_code' // unknown, inactive or expired code: guessing when repeated
  | 'reuse' // single-use voucher already used by this account
  | 'concurrent_reuse'; // parallel checkouts racing to use the same voucher

const SEVERITY: Record<VoucherRejectReason, 'low' | 'medium' | 'high'> = {
  invalid_code: 'low',
  reuse: 'medium',
  concurrent_reuse: 'high',
};

/**
 * Logs a rejected voucher so Wazuh can see guessing and reuse patterns.
 * The voucher itself is enforced by the caller; this only records it.
 */
export async function recordVoucherRejection(params: {
  reason: VoucherRejectReason;
  code: string;
  ipAddress: string;
  endpoint: string;
  userAgent: string;
  requestId: string;
  statusCode: number;
}): Promise<void> {
  const code = params.code.replace(/[^A-Z0-9_-]/gi, '').slice(0, 24) || 'EMPTY';
  await recordSecurityEvent({
    eventType: 'voucher_abuse_attempt',
    severity: SEVERITY[params.reason],
    ipAddress: params.ipAddress,
    method: 'POST',
    endpoint: params.endpoint,
    userAgent: params.userAgent,
    payloadSnippet: `reason=${params.reason}; code=${code}`,
    statusCode: params.statusCode,
    description: `Voucher rejected: ${params.reason}`,
    requestId: params.requestId,
  });
}
