import { createHmac } from 'crypto';

const MINIMUM_SECRET_LENGTH = 32;

export function normalizeAccountIdentifier(email: string): string {
  return email.normalize('NFKC').trim().toLowerCase();
}

/**
 * Produces a stable, non-reversible identifier for Wazuh correlation without
 * writing a customer's email address to security logs.
 */
export function createAccountReference(email: string): string {
  const secret = process.env.AUTH_ACCOUNT_REF_SECRET?.trim() || '';
  if (secret.length < MINIMUM_SECRET_LENGTH) {
    throw new Error('AUTH_ACCOUNT_REF_SECRET must contain at least 32 characters');
  }

  return createHmac('sha256', secret)
    .update(`customer:${normalizeAccountIdentifier(email)}`)
    .digest('hex')
    .slice(0, 32);
}
