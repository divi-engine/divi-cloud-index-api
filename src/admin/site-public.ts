import type { CloudIndexSitePublicRow } from '../db/sites.js';

export type PublicSite = {
  site_uid: string;
  site_id_short: string;
  site_url: string;
  status: string;
  tier: string;
  document_limit: number;
  document_count: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  typesense_key_id: number | null;
  trial_ends_at: string | null;
  grace_ends_at: string | null;
  trial_used: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
  stripe_customer_url: string | null;
  stripe_subscription_url: string | null;
  usage_percent: number;
};

function stripeDashboardBase(): string {
  const key = process.env.STRIPE_SECRET_KEY ?? '';
  return key.startsWith('sk_live_') ? 'https://dashboard.stripe.com' : 'https://dashboard.stripe.com/test';
}

export function toPublicSite(row: CloudIndexSitePublicRow): PublicSite {
  const base = stripeDashboardBase();
  const usagePercent =
    row.document_limit > 0 ? Math.round((row.document_count / row.document_limit) * 100) : 0;

  return {
    site_uid: row.site_uid,
    site_id_short: row.site_id_short,
    site_url: row.site_url,
    status: row.status,
    tier: row.tier,
    document_limit: row.document_limit,
    document_count: row.document_count,
    stripe_customer_id: row.stripe_customer_id,
    stripe_subscription_id: row.stripe_subscription_id,
    typesense_key_id: row.typesense_key_id,
    trial_ends_at: row.trial_ends_at ? row.trial_ends_at.toISOString() : null,
    grace_ends_at: row.grace_ends_at ? row.grace_ends_at.toISOString() : null,
    trial_used: row.trial_used,
    last_seen_at: row.last_seen_at ? row.last_seen_at.toISOString() : null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    stripe_customer_url: row.stripe_customer_id
      ? `${base}/customers/${row.stripe_customer_id}`
      : null,
    stripe_subscription_url: row.stripe_subscription_id
      ? `${base}/subscriptions/${row.stripe_subscription_id}`
      : null,
    usage_percent: usagePercent,
  };
}
