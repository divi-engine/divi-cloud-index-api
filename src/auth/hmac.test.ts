import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { resetEnvCache } from '../config.js';
import { signPayload } from './hmac.js';

function setTestEnv() {
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
  resetEnvCache();
}

describe('signPayload', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    setTestEnv();
  });

  afterEach(() => {
    process.env = { ...saved };
    resetEnvCache();
  });

  it('signs GET-style empty body consistently', () => {
    const sig = signPayload(['1700000000', 'site-uid', 'https://example.com', '']);
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
    expect(signPayload(['1700000000', 'site-uid', 'https://example.com', ''])).toBe(sig);
  });

  it('differs when body changes', () => {
    const a = signPayload(['1700000000', 'site-uid', 'https://example.com', '']);
    const b = signPayload(['1700000000', 'site-uid', 'https://example.com', '{"tier":"starter"}']);
    expect(a).not.toBe(b);
  });
});
