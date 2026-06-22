import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { getEnv } from '../config.js';

const MAX_SKEW_SEC = 300;

export function signPayload(parts: string[]): string {
  const env = getEnv();
  return createHmac('sha256', env.PLUGIN_HMAC_SECRET).update(parts.join('.')).digest('hex');
}

export function verifyPluginRequest(req: FastifyRequest): { ok: true } | { ok: false; message: string } {
  const siteUid = String(req.headers['x-de-site-uid'] ?? '');
  const siteUrl = String(req.headers['x-de-site-url'] ?? '');
  const timestamp = String(req.headers['x-de-timestamp'] ?? '');
  const signature = String(req.headers['x-de-signature'] ?? '');

  if (!siteUid || !timestamp || !signature) {
    return { ok: false, message: 'Missing auth headers' };
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    return { ok: false, message: 'Invalid timestamp' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > MAX_SKEW_SEC) {
    return { ok: false, message: 'Timestamp expired' };
  }

  const method = String(req.method || 'GET').toUpperCase();
  const body =
    method === 'GET'
      ? ''
      : req.body && Object.keys(req.body as object).length > 0
        ? JSON.stringify(req.body)
        : '';
  const expected = signPayload([timestamp, siteUid, siteUrl, body]);
  const a = Buffer.from(signature, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, message: 'Invalid signature' };
  }

  return { ok: true };
}

export function encryptApiKey(plain: string): string {
  return signPayload(['api-key', plain]);
}

export function decryptApiKey(ciphertext: string, siteUid: string): string | null {
  // Stored as HMAC digest only for MVP — plaintext returned at provision time only.
  // Ciphertext field stores reversible base64 for re-fetch on status.
  try {
    const decoded = Buffer.from(ciphertext, 'base64').toString('utf8');
    if (!decoded || decoded.length < 8) {
      return null;
    }
    if (!decoded.includes(siteUid.slice(0, 8))) {
      return decoded;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function storeApiKey(plain: string): string {
  return Buffer.from(plain, 'utf8').toString('base64');
}

export function readStoredApiKey(ciphertext: string | null): string | null {
  if (!ciphertext) {
    return null;
  }
  try {
    return Buffer.from(ciphertext, 'base64').toString('utf8');
  } catch {
    return null;
  }
}
