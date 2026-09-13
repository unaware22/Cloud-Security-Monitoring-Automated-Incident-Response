import { recordSecurityEvent } from './security';

type AdminContentAction =
  | 'PRODUCT_CREATE'
  | 'PRODUCT_UPDATE'
  | 'PRODUCT_PATCH'
  | 'PRODUCT_DELETE'
  | 'PRODUCT_REORDER';

export async function recordAdminContentChange(params: {
  action: AdminContentAction;
  adminId: string;
  entityId: string;
  ipAddress: string;
  userAgent: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  endpoint: string;
  statusCode?: number;
  summary?: string;
  requestId?: string;
}): Promise<void> {
  await recordSecurityEvent({
    eventType: 'admin_content_change',
    severity: params.action === 'PRODUCT_DELETE' ? 'high' : 'medium',
    ipAddress: params.ipAddress,
    method: params.method,
    endpoint: params.endpoint,
    userAgent: params.userAgent,
    payloadSnippet: JSON.stringify({
      action: params.action,
      admin_id: params.adminId,
      entity_id: params.entityId,
      summary: params.summary || '',
    }),
    statusCode: params.statusCode || 200,
    description: `Authenticated admin content change: ${params.action}`,
    requestId: params.requestId,
  });
}
