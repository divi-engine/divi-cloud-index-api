import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { resetEnvCache } from '../config.js';
import { signPayload, verifyPluginRequest } from './hmac.js';

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

describe('verifyPluginRequest', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    setTestEnv();
  });

  afterEach(() => {
    process.env = { ...saved };
    resetEnvCache();
  });

  it('accepts POST when signature uses raw body bytes (PHP escaped-slash compat)', () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const siteUid = '3c489b85-e57d-4283-9f3b-ff73347658b6';
    const siteUrl = 'http://localhost/divi-5/';
    const rawBody =
      '{"site_uid":"3c489b85-e57d-4283-9f3b-ff73347658b6","site_url":"http:\\/\\/localhost\\/divi-5\\/","tier":"starter"}';
    const signature = signPayload([ts, siteUid, siteUrl, rawBody]);

    const req = {
      method: 'POST',
      headers: {
        'x-de-site-uid': siteUid,
        'x-de-site-url': siteUrl,
        'x-de-timestamp': ts,
        'x-de-signature': signature,
      },
      body: JSON.parse(rawBody),
      rawBody: Buffer.from(rawBody, 'utf8'),
    };

    expect(verifyPluginRequest(req as never)).toEqual({ ok: true });
  });
});
