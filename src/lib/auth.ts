import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { AdminSessionPayload } from './types';

const JWT_SECRET = new TextEncoder().encode(
  process.env.ADMIN_JWT_SECRET || 'thesis-admin-jwt-secret-fallback-key-2026'
);

const COOKIE_NAME = 'admin_session_token';

/**
 * Creates and signs a JWT for an authenticated admin
 */
export async function createAdminToken(payload: AdminSessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(JWT_SECRET);
}

/**
 * Verifies a JWT token
 */
export async function verifyAdminToken(token: string): Promise<AdminSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      role: payload.role as string,
    };
  } catch {
    return null;
  }
}

/**
 * Extracts and verifies admin session from request cookies or Authorization header
 */
export async function getAdminSession(req?: NextRequest): Promise<AdminSessionPayload | null> {
  let token: string | undefined;

  if (req) {
    // Check Authorization Bearer header
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else {
      token = req.cookies.get(COOKIE_NAME)?.value;
    }
  } else {
    // Next.js server component context
    try {
      const cookieStore = cookies();
      token = cookieStore.get(COOKIE_NAME)?.value;
    } catch {
      return null;
    }
  }

  if (!token) return null;
  return verifyAdminToken(token);
}

export { COOKIE_NAME };
