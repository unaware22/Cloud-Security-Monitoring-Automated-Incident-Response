import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import { logSecurityEventToFile, sanitizeForLogs } from './logger';
import { SecurityEventType, SecuritySeverity, SecurityEventLog } from './types';

// Sensitive paths reconnaissance pattern
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

// SQL Injection detection regex
const SQLI_PATTERNS = [
  /(\b(select|union|insert|delete|update|drop|truncate|alter|create|load_file|outfile)\b[\s\S]+\b(from|into|table|database|schema)\b)/i,
  /(\bunion\b[\s\S]+\bselect\b)/i,
  /((\%27)|(')|(\-\-)|(\%23)|(#))(\s)*(or|and|exec|execute|union)\b/i,
  /(\b(or|and)\b\s+[\w\d'"]+\s*=\s*[\w\d'"]+)/i,
  /(\b(sleep|benchmark|waitfor|pg_sleep)\s*\(\s*\d+\s*\))/i,
  /('[\s\S]*--)|(;[\s\S]*--)/i,
  /(char\(\d+\)|concat\(|group_concat\()/i,
];

// Cross-Site Scripting (XSS) detection regex
const XSS_PATTERNS = [
  /<script[\s\S]*?>[\s\S]*?<\/script>/i,
  /<script[\s\S]*?>/i,
  /javascript\s*:/i,
  /vbscript\s*:/i,
  /onload\s*=\s*['"]?[^'"]*['"]?/i,
  /onerror\s*=\s*['"]?[^'"]*['"]?/i,
  /onclick\s*=\s*['"]?[^'"]*['"]?/i,
  /onmouseover\s*=\s*['"]?[^'"]*['"]?/i,
  /<iframe[\s\S]*?>/i,
  /<img[\s\S]+?onerror/i,
  /<svg[\s\S]+?onload/i,
  /<body[\s\S]+?onload/i,
  /document\.cookie/i,
  /eval\s*\(/i,
];

/**
 * Checks if the request path matches sensitive scanner paths
 */
export function detectSensitivePath(pathname: string): boolean {
  const decoded = decodeURIComponent(pathname);
  return SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(decoded));
}

/**
 * Detects SQL injection attempt in input strings
 */
export function detectSQLi(input: any): boolean {
  if (!input) return false;
  const str = typeof input === 'string' ? input : JSON.stringify(input);
  return SQLI_PATTERNS.some((pattern) => pattern.test(str));
}

/**
 * Detects Cross-Site Scripting attempt in input strings
 */
export function detectXSS(input: any): boolean {
  if (!input) return false;
  const str = typeof input === 'string' ? input : JSON.stringify(input);
  return XSS_PATTERNS.some((pattern) => pattern.test(str));
}

/**
 * Generates a cryptographically secure random order code (e.g. ORD-7B9F2K4Q)
 */
export function generateOrderCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Exclude ambiguous chars 0, 1, I, O
  let result = 'ORD-';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

/**
 * Hashes password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Verifies password with bcrypt hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Extracts Client IP address from request headers
 */
export function getClientIp(headers: Headers | Record<string, string | string[] | undefined>): string {
  let ip: string | null = null;
  if (headers instanceof Headers) {
    ip = headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      headers.get('x-real-ip') ||
      headers.get('cf-connecting-ip') ||
      null;
  } else {
    const forwarded = headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      ip = forwarded.split(',')[0].trim();
    } else if (Array.isArray(forwarded) && forwarded[0]) {
      ip = forwarded[0].split(',')[0].trim();
    } else if (typeof headers['x-real-ip'] === 'string') {
      ip = headers['x-real-ip'];
    }
  }
  return ip || '127.0.0.1';
}

/**
 * Records a security event:
 * 1. Appends strictly formatted JSON line to logs/security_events.log for Wazuh Agent
 * 2. Persists to security_events table in PostgreSQL database
 */
export async function recordSecurityEvent(params: {
  eventType: SecurityEventType;
  severity: SecuritySeverity;
  ipAddress: string;
  method: string;
  endpoint: string;
  userAgent?: string;
  payloadSnippet?: string;
  statusCode: number;
  description?: string;
  requestId?: string;
}): Promise<void> {
  const createdAt = new Date().toISOString();
  const requestId = params.requestId || `req-${crypto.randomBytes(6).toString('hex')}`;
  const sanitizedSnippet = sanitizeForLogs(params.payloadSnippet || '');

  // 1. Log to file for Wazuh Agent
  const fileLogEntry: SecurityEventLog = {
    event_type: params.eventType,
    severity: params.severity,
    ip_address: params.ipAddress || '127.0.0.1',
    method: params.method,
    endpoint: params.endpoint,
    user_agent: params.userAgent || 'Unknown',
    payload_snippet: sanitizedSnippet,
    status_code: params.statusCode,
    request_id: requestId,
    created_at: createdAt,
  };

  logSecurityEventToFile(fileLogEntry);

  // 2. Persist to PostgreSQL database asynchronously (non-blocking)
  prisma.securityEvent
    .create({
      data: {
        eventType: params.eventType,
        severity: params.severity,
        ipAddress: params.ipAddress || '127.0.0.1',
        method: params.method,
        endpoint: params.endpoint,
        userAgent: params.userAgent || 'Unknown',
        payloadSnippet: sanitizedSnippet,
        statusCode: params.statusCode,
        description: params.description || '',
        requestId: requestId,
      },
    })
    .catch((err) => {
      // Non-blocking log if DB is offline during local test
    });
}
