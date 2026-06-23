import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { resetEnvCache } from '../config.js';
import {
  createSessionToken,
  verifyAdminPassword,
  verifySessionToken,
} from './admin-session.js';

function setTestEnv(withAdmin = true) {
  process.env.PLUGIN_HMAC_SECRET = 'test-secret-key';
  process.env.DATABASE_URL = 'postgresql://localhost/test';
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
  process.env.STRIPE_PRICE_CLOUD_STARTER = 'price_starter';
  process.env.STRIPE_PRICE_CLOUD_GROWTH = 'price_growth';
  process.env.STRIPE_PRICE_CLOUD_SCALE = 'price_scale';
  process.env.TYPESENSE_HOST = 'localhost';
  process.env.TYPESENSE_ADMIN_API_KEY = 'admin';
  process.env.CHECKOUT_SUCCESS_URL = 'https://example.com/success';
  process.env.CHECKOUT_CANCEL_URL = 'https://example.com/cancel';
  process.env.STRIPE_PORTAL_RETURN_URL = 'https://example.com/portal';
  if (withAdmin) {
    process.env.ADMIN_PASSWORD = 'test-admin-password';
    process.env.ADMIN_SESSION_SECRET = 'test-session-secret-key';
    process.env.ADMIN_SESSION_TTL_HOURS = '24';
  } else {
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_SESSION_SECRET;
  }
  resetEnvCache();
}

describe('verifyAdminPassword', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    setTestEnv(true);
  });

  afterEach(() => {
    process.env = { ...saved };
    resetEnvCache();
  });

  it('accepts the configured password', () => {
    expect(verifyAdminPassword('test-admin-password')).toBe(true);
  });

  it('rejects wrong password', () => {
    expect(verifyAdminPassword('wrong-password')).toBe(false);
  });

  it('returns false when admin is disabled', () => {
    setTestEnv(false);
    expect(verifyAdminPassword('test-admin-password')).toBe(false);
  });
});

describe('session token', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    setTestEnv(true);
  });

  afterEach(() => {
    process.env = { ...saved };
    resetEnvCache();
  });

  it('roundtrips create and verify', () => {
    const token = createSessionToken();
    expect(verifySessionToken(token)).toBe(true);
  });

  it('rejects tampered token', () => {
    const token = createSessionToken();
    expect(verifySessionToken(`${token}x`)).toBe(false);
  });

  it('rejects when admin disabled', () => {
    const token = createSessionToken();
    setTestEnv(false);
    expect(verifySessionToken(token)).toBe(false);
  });
});
