import crypto from 'crypto';

/**
 * Generates a high-entropy token that is safe to place in an email URL.
 * Only the SHA-256 digest is stored in PostgreSQL so a database read cannot
 * immediately be used to verify an account or reset its password.
 */
export function generateOpaqueToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, tokenHash: hashOpaqueToken(token) };
}

export function hashOpaqueToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}
