import { recordSecurityEvent } from './security';
import { SecuritySeverity } from './types';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitBucket>();

// Periodically clean up expired entries
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateLimitStore.entries()) {
    if (bucket.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000);

export interface RateLimitConfig {
  actionName: string;
  limit: number;
  windowMs: number; // e.g. 60000 for 1 minute
  severity?: SecuritySeverity;
}

export const RATE_LIMIT_RULES: Record<string, RateLimitConfig> = {
  ADMIN_LOGIN: {
    actionName: 'admin_login',
    limit: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    severity: 'critical',
  },
  CHECK_ORDER: {
    actionName: 'check_order',
    limit: 120,
    windowMs: 60 * 1000, // 1 minute
    severity: 'low',
  },
  CHECKOUT: {
    actionName: 'checkout',
    limit: 10,
    windowMs: 60 * 1000, // 1 minute
    severity: 'medium',
  },
  WEBHOOK: {
    actionName: 'webhook',
    limit: 30,
    windowMs: 60 * 1000, // 1 minute
    severity: 'high',
  },
  GENERAL_API: {
    actionName: 'general_api',
    limit: 100,
    windowMs: 60 * 1000, // 1 minute
    severity: 'low',
  },
};

export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig,
  context?: {
    endpoint: string;
    method: string;
    userAgent?: string;
    requestId?: string;
  }
): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
  const now = Date.now();
  const key = `${config.actionName}:${identifier}`;
  const bucket = rateLimitStore.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + config.windowMs,
    });
    return { allowed: true, remaining: config.limit - 1, resetTime: now + config.windowMs };
  }

  if (bucket.count >= config.limit) {
    // Record security event when rate limit is exceeded
    if (context) {
      const eventType =
        config.actionName === 'admin_login'
          ? 'admin_bruteforce_attempt'
          : config.actionName === 'check_order'
          ? 'order_enumeration_attempt'
          : config.actionName === 'checkout'
          ? 'checkout_abuse'
          : 'rate_limit_exceeded';

      await recordSecurityEvent({
        eventType: eventType as any,
        severity: config.severity || 'medium',
        ipAddress: identifier,
        method: context.method,
        endpoint: context.endpoint,
        userAgent: context.userAgent,
        payloadSnippet: `Exceeded rate limit for ${config.actionName}: ${bucket.count} requests`,
        statusCode: 429,
        description: `Rate limit of ${config.limit} reached on ${config.actionName}`,
        requestId: context.requestId,
      });
    }

    return { allowed: false, remaining: 0, resetTime: bucket.resetAt };
  }

  bucket.count += 1;
  return { allowed: true, remaining: config.limit - bucket.count, resetTime: bucket.resetAt };
}
