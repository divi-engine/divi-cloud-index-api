import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { adminCookieSecure, getEnv, isAdminEnabled } from '../config.js';

export const ADMIN_COOKIE_NAME = 'de_cloud_admin';

function sessionSecret(): string {
  return getEnv().ADMIN_SESSION_SECRET!;
}

function sessionTtlMs(): number {
  return getEnv().ADMIN_SESSION_TTL_HOURS * 60 * 60 * 1000;
}

function signPayload(payload: string): string {
  return createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

export function verifyAdminPassword(password: string): boolean {
  if (!isAdminEnabled()) {
    return false;
  }
  const expected = getEnv().ADMIN_PASSWORD!;
  const a = Buffer.from(password, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function createSessionToken(): string {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + sessionTtlMs();
  const nonce = randomBytes(16).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp: expiresAt, iat: issuedAt, n: nonce })).toString(
    'base64url'
  );
  const sig = signPayload(payload);
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token || !isAdminEnabled()) {
    return false;
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return false;
  }

  const [payload, sig] = parts;
  const expectedSig = signPayload(payload);
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return false;
  }

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      exp?: number;
    };
    if (!data.exp || Date.now() > data.exp) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(ADMIN_COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    secure: adminCookieSecure(),
    sameSite: 'strict',
    maxAge: getEnv().ADMIN_SESSION_TTL_HOURS * 60 * 60,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(ADMIN_COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    secure: adminCookieSecure(),
    sameSite: 'strict',
  });
}

export function readSessionToken(req: FastifyRequest): string | undefined {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  return cookies?.[ADMIN_COOKIE_NAME];
}

export async function requireAdminSession(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!isAdminEnabled()) {
    reply.code(503).send({ error: 'Admin dashboard is not configured' });
    return;
  }

  if (!verifySessionToken(readSessionToken(req))) {
    reply.code(401).send({ error: 'Unauthorized' });
  }
}
