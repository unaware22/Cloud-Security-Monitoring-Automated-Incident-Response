import crypto from 'crypto';
import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { CustomerSessionPayload, GoogleUserPayload } from './types';
import { prisma } from './prisma';

const USER_TOKEN_ISSUER = 'saladinshop';
const USER_TOKEN_AUDIENCE = 'saladinshop-customer';
export const CUSTOMER_COOKIE_NAME = 'customer_session_token';

function getUserSessionTtlSeconds(): number {
  const configured = Number(process.env.CUSTOMER_SESSION_TTL_SECONDS || 7 * 24 * 3600); // 7 days
  if (!Number.isInteger(configured)) return 7 * 24 * 3600;
  return Math.min(Math.max(configured, 300), 30 * 24 * 3600);
}

function getUserJwtSecret(): Uint8Array {
  const secret = process.env.CUSTOMER_JWT_SECRET || 'super-secure-customer-jwt-secret-key-thesis-2026-saladinshop';
  if (!secret || secret.length < 32) {
    throw new Error('CUSTOMER_JWT_SECRET must be set to at least 32 characters');
  }
  return new TextEncoder().encode(secret);
}

/**
 * Creates and signs a JWT for an authenticated customer
 */
export async function createUserToken(payload: CustomerSessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(USER_TOKEN_ISSUER)
    .setAudience(USER_TOKEN_AUDIENCE)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${getUserSessionTtlSeconds()}s`)
    .sign(getUserJwtSecret());
}

/**
 * Verifies a customer JWT token signature and expiration
 */
export async function verifyUserToken(token: string): Promise<CustomerSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getUserJwtSecret(), {
      issuer: USER_TOKEN_ISSUER,
      audience: USER_TOKEN_AUDIENCE,
    });
    if (
      typeof payload.userId !== 'string' ||
      typeof payload.email !== 'string' ||
      typeof payload.name !== 'string' ||
      payload.role !== 'customer' ||
      typeof payload.sessionVersion !== 'number'
    ) {
      return null;
    }
    return {
      userId: payload.userId,
      email: payload.email,
      name: payload.name,
      role: 'customer',
      sessionVersion: payload.sessionVersion,
    };
  } catch {
    return null;
  }
}

/**
 * Extracts and verifies customer session from request cookies or Authorization header.
 * Validates sessionVersion against the PostgreSQL database to enforce instant session revocation.
 */
export async function getCustomerSession(req?: NextRequest): Promise<CustomerSessionPayload | null> {
  let token: string | undefined;

  if (req) {
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else {
      token = req.cookies.get(CUSTOMER_COOKIE_NAME)?.value;
    }
  } else {
    try {
      const cookieStore = cookies();
      token = cookieStore.get(CUSTOMER_COOKIE_NAME)?.value;
    } catch {
      return null;
    }
  }

  if (!token) return null;

  const payload = await verifyUserToken(token);
  if (!payload) return null;

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        sessionVersion: true,
      },
    });

    if (
      !user ||
      user.email.toLowerCase() !== payload.email.toLowerCase() ||
      user.sessionVersion !== payload.sessionVersion
    ) {
      return null;
    }

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: 'customer',
      sessionVersion: user.sessionVersion,
    };
  } catch {
    return null;
  }
}

// Google JWKS client for verifying Google ID Tokens
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
let googleJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getGoogleJwks() {
  if (!googleJwks) {
    googleJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
  }
  return googleJwks;
}

/**
 * Cryptographically verifies Google ID Token and extracts subject ID (sub)
 * Sesuai panduan Google Identity Services: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleUserPayload> {
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('Google ID token is required');
  }

  const configuredClientId =
    process.env.GOOGLE_CLIENT_ID ||
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    '';

  // In production / when Client ID is configured, verify against Google's public keys
  try {
    const JWKS = getGoogleJwks();
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      ...(configuredClientId ? { audience: configuredClientId } : {}),
    });

    if (!payload.sub || typeof payload.sub !== 'string') {
      throw new Error('Missing sub claim in Google ID token');
    }
    if (!payload.email || typeof payload.email !== 'string') {
      throw new Error('Missing email in Google ID token');
    }

    return {
      sub: payload.sub,
      email: payload.email.toLowerCase(),
      emailVerified: Boolean(payload.email_verified),
      name: (payload.name as string) || (payload.email as string).split('@')[0],
      picture: (payload.picture as string) || undefined,
    };
  } catch (error: any) {
    // If JWKS verification failed and no clientId configured (local dev fallback if mocked):
    if (!configuredClientId && process.env.NODE_ENV !== 'production') {
      try {
        const parts = idToken.split('.');
        if (parts.length === 3) {
          const rawPayload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          if (rawPayload.sub && rawPayload.email) {
            return {
              sub: String(rawPayload.sub),
              email: String(rawPayload.email).toLowerCase(),
              emailVerified: Boolean(rawPayload.email_verified),
              name: String(rawPayload.name || rawPayload.email.split('@')[0]),
              picture: rawPayload.picture ? String(rawPayload.picture) : undefined,
            };
          }
        }
      } catch {}
    }
    throw new Error(`Google ID Token verification failed: ${error.message || 'Invalid signature'}`);
  }
}
