import postgres from 'postgres';
import { getEnv } from '../config.js';

let sql: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (!sql) {
    sql = postgres(getEnv().DATABASE_URL, { max: 10 });
  }
  return sql;
}

export type CloudIndexSiteRow = {
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
  api_key_ciphertext: string | null;
  trial_ends_at: Date | null;
  grace_ends_at: Date | null;
  trial_used: boolean;
  last_seen_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export async function ensureSchema() {
  const db = getDb();
  await db.unsafe(`
    CREATE TABLE IF NOT EXISTS cloud_index_sites (
      site_uid UUID PRIMARY KEY,
      site_id_short VARCHAR(16) NOT NULL,
      site_url TEXT NOT NULL DEFAULT '',
      status VARCHAR(32) NOT NULL DEFAULT 'none',
      tier VARCHAR(32) NOT NULL DEFAULT 'starter',
      document_limit INTEGER NOT NULL DEFAULT 5000,
      document_count INTEGER NOT NULL DEFAULT 0,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      typesense_key_id INTEGER,
      api_key_ciphertext TEXT,
      trial_ends_at TIMESTAMPTZ,
      grace_ends_at TIMESTAMPTZ,
      trial_used BOOLEAN NOT NULL DEFAULT FALSE,
      last_seen_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function getSiteByUid(siteUid: string): Promise<CloudIndexSiteRow | null> {
  const db = getDb();
  const rows = await db<CloudIndexSiteRow[]>`
    SELECT * FROM cloud_index_sites WHERE site_uid = ${siteUid} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function upsertSiteDraft(input: {
  siteUid: string;
  siteIdShort: string;
  siteUrl: string;
}): Promise<CloudIndexSiteRow> {
  const db = getDb();
  const rows = await db<CloudIndexSiteRow[]>`
    INSERT INTO cloud_index_sites (site_uid, site_id_short, site_url, last_seen_at, updated_at)
    VALUES (${input.siteUid}, ${input.siteIdShort}, ${input.siteUrl}, NOW(), NOW())
    ON CONFLICT (site_uid) DO UPDATE SET
      site_url = EXCLUDED.site_url,
      last_seen_at = NOW(),
      updated_at = NOW()
    RETURNING *
  `;
  return rows[0];
}

export async function updateSite(
  siteUid: string,
  patch: Partial<{
    status: string;
    tier: string;
    document_limit: number;
    document_count: number;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    typesense_key_id: number | null;
    api_key_ciphertext: string | null;
    trial_ends_at: Date | null;
    grace_ends_at: Date | null;
    trial_used: boolean;
  }>
): Promise<CloudIndexSiteRow | null> {
  const db = getDb();
  const current = await getSiteByUid(siteUid);
  if (!current) {
    return null;
  }

  const rows = await db<CloudIndexSiteRow[]>`
    UPDATE cloud_index_sites SET
      status = ${patch.status ?? current.status},
      tier = ${patch.tier ?? current.tier},
      document_limit = ${patch.document_limit ?? current.document_limit},
      document_count = ${patch.document_count ?? current.document_count},
      stripe_customer_id = ${patch.stripe_customer_id !== undefined ? patch.stripe_customer_id : current.stripe_customer_id},
      stripe_subscription_id = ${patch.stripe_subscription_id !== undefined ? patch.stripe_subscription_id : current.stripe_subscription_id},
      typesense_key_id = ${patch.typesense_key_id !== undefined ? patch.typesense_key_id : current.typesense_key_id},
      api_key_ciphertext = ${patch.api_key_ciphertext !== undefined ? patch.api_key_ciphertext : current.api_key_ciphertext},
      trial_ends_at = ${patch.trial_ends_at !== undefined ? patch.trial_ends_at : current.trial_ends_at},
      grace_ends_at = ${patch.grace_ends_at !== undefined ? patch.grace_ends_at : current.grace_ends_at},
      trial_used = ${patch.trial_used ?? current.trial_used},
      updated_at = NOW()
    WHERE site_uid = ${siteUid}
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function listSitesForCleanup(): Promise<CloudIndexSiteRow[]> {
  const db = getDb();
  return db<CloudIndexSiteRow[]>`
    SELECT * FROM cloud_index_sites
    WHERE status IN ('trialing', 'cancelled', 'past_due', 'expired')
  `;
}

export async function listActiveSites(): Promise<CloudIndexSiteRow[]> {
  const db = getDb();
  return db<CloudIndexSiteRow[]>`
    SELECT * FROM cloud_index_sites
    WHERE status IN ('trialing', 'active', 'past_due', 'cancelled')
  `;
}

export async function getSiteByStripeCustomer(customerId: string): Promise<CloudIndexSiteRow | null> {
  const db = getDb();
  const rows = await db<CloudIndexSiteRow[]>`
    SELECT * FROM cloud_index_sites WHERE stripe_customer_id = ${customerId} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function getSiteByStripeSubscription(subscriptionId: string): Promise<CloudIndexSiteRow | null> {
  const db = getDb();
  const rows = await db<CloudIndexSiteRow[]>`
    SELECT * FROM cloud_index_sites WHERE stripe_subscription_id = ${subscriptionId} LIMIT 1
  `;
  return rows[0] ?? null;
}
