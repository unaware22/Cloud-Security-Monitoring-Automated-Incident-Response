import crypto from 'crypto';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { AdminSessionPayload } from './types';
import { prisma } from './prisma';

const ADMIN_TOKEN_ISSUER = 'saladinshop';
const ADMIN_TOKEN_AUDIENCE = 'saladinshop-admin';

function getSessionTtlSeconds(): number {
  const configured = Number(process.env.ADMIN_SESSION_TTL_SECONDS || 3600);
  if (!Number.isInteger(configured)) return 3600;
  return Math.min(Math.max(configured, 300), 86400);
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.ADMIN_JWT_SECRET;

  // Authentication must fail closed. A predictable fallback would allow anyone
  // who reads the source code to forge an admin session.
  if (!secret || secret.length < 32) {
    throw new Error('ADMIN_JWT_SECRET must be set to at least 32 characters');
  }

  return new TextEncoder().encode(secret);
}

const COOKIE_NAME = 'admin_session_token';

/**
 * Creates and signs a JWT for an authenticated admin
 */
export async function createAdminToken(payload: AdminSessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ADMIN_TOKEN_ISSUER)
    .setAudience(ADMIN_TOKEN_AUDIENCE)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${getSessionTtlSeconds()}s`)
    .sign(getJwtSecret());
}

/**
 * Verifies a JWT token
 */
export async function verifyAdminToken(token: string): Promise<AdminSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      issuer: ADMIN_TOKEN_ISSUER,
      audience: ADMIN_TOKEN_AUDIENCE,
    });
    if (
      typeof payload.userId !== 'string' ||
      typeof payload.email !== 'string' ||
      typeof payload.role !== 'string' ||
      typeof payload.sessionVersion !== 'number'
    ) {
      return null;
    }
    return {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      sessionVersion: payload.sessionVersion,
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

  const payload = await verifyAdminToken(token);
  if (!payload) return null;

  try {
    const admin = await prisma.adminUser.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        sessionVersion: true,
      },
    });

    if (
      !admin ||
      !admin.isActive ||
      admin.email.toLowerCase() !== payload.email.toLowerCase() ||
      admin.role !== payload.role ||
      admin.sessionVersion !== payload.sessionVersion
    ) {
      return null;
    }

    return payload;
  } catch {
    // Administrative authorization must fail closed when RDS is unavailable.
    return null;
  }
}

export { COOKIE_NAME, getSessionTtlSeconds };
