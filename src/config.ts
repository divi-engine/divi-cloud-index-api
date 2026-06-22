import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(8787),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  PLUGIN_HMAC_SECRET: z.string().min(8),
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_PRICE_CLOUD_STARTER: z.string().min(1),
  STRIPE_PRICE_CLOUD_GROWTH: z.string().min(1),
  STRIPE_PRICE_CLOUD_SCALE: z.string().min(1),
  TYPESENSE_HOST: z.string().min(1),
  TYPESENSE_PORT: z.coerce.number().default(443),
  TYPESENSE_PROTOCOL: z.enum(['http', 'https']).default('https'),
  TYPESENSE_ADMIN_API_KEY: z.string().min(1),
  CHECKOUT_SUCCESS_URL: z.string().url(),
  CHECKOUT_CANCEL_URL: z.string().url(),
  STRIPE_PORTAL_RETURN_URL: z.string().url(),
  CLOUD_INDEX_TRIAL_DAYS: z.coerce.number().default(14),
  CLOUD_INDEX_CANCEL_GRACE_DAYS: z.coerce.number().default(7),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/** @internal test helper */
export function resetEnvCache(): void {
  cached = null;
}

export function getEnv(): Env {
  if (!cached) {
    cached = envSchema.parse(process.env);
  }
  return cached;
}

export type CloudTier = 'starter' | 'growth' | 'scale';

export const TIER_LIMITS: Record<CloudTier, number> = {
  starter: 5000,
  growth: 25000,
  scale: 100000,
};

export type SubscriptionStatus =
  | 'none'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'expired';

export function tierFromPriceId(priceId: string): CloudTier {
  const env = getEnv();
  if (priceId === env.STRIPE_PRICE_CLOUD_GROWTH) {
    return 'growth';
  }
  if (priceId === env.STRIPE_PRICE_CLOUD_SCALE) {
    return 'scale';
  }
  return 'starter';
}

export function priceIdForTier(tier: CloudTier): string {
  const env = getEnv();
  switch (tier) {
    case 'growth':
      return env.STRIPE_PRICE_CLOUD_GROWTH;
    case 'scale':
      return env.STRIPE_PRICE_CLOUD_SCALE;
    default:
      return env.STRIPE_PRICE_CLOUD_STARTER;
  }
}
