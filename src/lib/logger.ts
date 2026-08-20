import fs from 'fs';
import path from 'path';
import { SecurityEventLog } from './types';

const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'logs');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create logs directory:', err);
  }
}

const SECURITY_LOG_PATH = path.join(LOG_DIR, 'security_events.log');
const ACCESS_LOG_PATH = path.join(LOG_DIR, 'access.log');

/**
 * Sanitizes input to avoid exposing passwords, secret tokens, or payment credentials in logs
 */
export function sanitizeForLogs(data: any): string {
  if (data === null || data === undefined) return '';
  if (typeof data === 'string') {
    let sanitized = data;
    // Mask authorization headers or bearer tokens
    sanitized = sanitized.replace(/(Bearer\s+)[A-Za-z0-9\-_.]+/gi, '$1[REDACTED]');
    // Mask password fields in JSON/query
    sanitized = sanitized.replace(/"password"\s*:\s*"[^"]*"/gi, '"password":"[REDACTED]"');
    sanitized = sanitized.replace(/password=[^&]+/gi, 'password=[REDACTED]');
    // Mask secret keys or tokens
    sanitized = sanitized.replace(/(xnd_[a-zA-Z0-9_]+)/gi, '[REDACTED_XENDIT_KEY]');
    sanitized = sanitized.replace(/"(token|secret|jwt|passwordHash)"\s*:\s*"[^"]*"/gi, '"$1":"[REDACTED]"');
    // Truncate length
    if (sanitized.length > 500) {
      sanitized = sanitized.substring(0, 500) + '...[TRUNCATED]';
    }
    return sanitized;
  }
  try {
    const cloned = JSON.parse(JSON.stringify(data));
    const sensitiveKeys = ['password', 'passwordHash', 'token', 'secret', 'jwt', 'authorization', 'apiKey', 'creditCard'];
    const maskObj = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;
      for (const k of Object.keys(obj)) {
        if (sensitiveKeys.some(s => k.toLowerCase().includes(s.toLowerCase()))) {
          obj[k] = '[REDACTED]';
        } else if (typeof obj[k] === 'object') {
          maskObj(obj[k]);
        }
      }
    };
    maskObj(cloned);
    const jsonStr = JSON.stringify(cloned);
    return jsonStr.length > 500 ? jsonStr.substring(0, 500) + '...[TRUNCATED]' : jsonStr;
  } catch {
    return String(data).substring(0, 500);
  }
}

/**
 * Appends a strictly formatted JSON line to logs/security_events.log for Wazuh Agent ingestion
 */
export function logSecurityEventToFile(event: SecurityEventLog): void {
  try {
    const cleanEvent: SecurityEventLog = {
      event_type: event.event_type,
      severity: event.severity,
      ip_address: event.ip_address || '127.0.0.1',
      method: event.method || 'UNKNOWN',
      endpoint: event.endpoint || '/',
      user_agent: event.user_agent || 'Unknown-Agent',
      payload_snippet: sanitizeForLogs(event.payload_snippet || ''),
      status_code: Number(event.status_code) || 400,
      request_id: event.request_id || `req-${Date.now()}`,
      created_at: event.created_at || new Date().toISOString(),
    };

    const jsonLine = JSON.stringify(cleanEvent) + '\n';
    fs.appendFileSync(SECURITY_LOG_PATH, jsonLine, { encoding: 'utf8' });
  } catch (err) {
    console.error('Error writing to security_events.log:', err);
  }
}

/**
 * Appends a structured JSON access log line to logs/access.log
 */
export function logAccessToFile(entry: {
  request_id: string;
  ip_address: string;
  method: string;
  endpoint: string;
  status_code: number;
  response_time_ms: number;
  user_agent: string;
}): void {
  try {
    const logObj = {
      timestamp: new Date().toISOString(),
      ...entry,
    };
    const jsonLine = JSON.stringify(logObj) + '\n';
    fs.appendFileSync(ACCESS_LOG_PATH, jsonLine, { encoding: 'utf8' });
  } catch (err) {
    console.error('Error writing to access.log:', err);
  }
}
