import postgres from 'postgres';
import { getEnv } from '../config.js';

let sql: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (!sql) {
    const url = getEnv().DATABASE_URL;
    const needsSsl = url.includes('supabase.co') || url.includes('supabase.com');
    sql = postgres(url, {
      max: 10,
      ...(needsSsl ? { ssl: 'require' as const } : {}),
    });
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

export type CloudIndexSitePublicRow = Omit<CloudIndexSiteRow, 'api_key_ciphertext'>;

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

export async function getSiteByUidPublic(siteUid: string): Promise<CloudIndexSitePublicRow | null> {
  const db = getDb();
  const rows = await db<CloudIndexSitePublicRow[]>`
    SELECT
      site_uid,
      site_id_short,
      site_url,
      status,
      tier,
      document_limit,
      document_count,
      stripe_customer_id,
      stripe_subscription_id,
      typesense_key_id,
      trial_ends_at,
      grace_ends_at,
      trial_used,
      last_seen_at,
      created_at,
      updated_at
    FROM cloud_index_sites WHERE site_uid = ${siteUid} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function listAllSites(input: {
  status?: string;
  tier?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ sites: CloudIndexSitePublicRow[]; total: number }> {
  const db = getDb();
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);
  const search = input.search?.trim() ?? '';
  const searchPattern = search ? `%${search}%` : null;

  const [countRow] = await db<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM cloud_index_sites
    WHERE (${input.status ?? null}::text IS NULL OR status = ${input.status ?? null})
      AND (${input.tier ?? null}::text IS NULL OR tier = ${input.tier ?? null})
      AND (
        ${searchPattern}::text IS NULL
        OR site_url ILIKE ${searchPattern}
        OR site_id_short ILIKE ${searchPattern}
        OR site_uid::text ILIKE ${searchPattern}
      )
  `;

  const sites = await db<CloudIndexSitePublicRow[]>`
    SELECT
      site_uid,
      site_id_short,
      site_url,
      status,
      tier,
      document_limit,
      document_count,
      stripe_customer_id,
      stripe_subscription_id,
      typesense_key_id,
      trial_ends_at,
      grace_ends_at,
      trial_used,
      last_seen_at,
      created_at,
      updated_at
    FROM cloud_index_sites
    WHERE (${input.status ?? null}::text IS NULL OR status = ${input.status ?? null})
      AND (${input.tier ?? null}::text IS NULL OR tier = ${input.tier ?? null})
      AND (
        ${searchPattern}::text IS NULL
        OR site_url ILIKE ${searchPattern}
        OR site_id_short ILIKE ${searchPattern}
        OR site_uid::text ILIKE ${searchPattern}
      )
    ORDER BY updated_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  return { sites, total: countRow?.count ?? 0 };
}

export async function countAllSites(): Promise<number> {
  const db = getDb();
  const [row] = await db<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM cloud_index_sites`;
  return row?.count ?? 0;
}

export async function countSitesByStatus(): Promise<Record<string, number>> {
  const db = getDb();
  const rows = await db<{ status: string; count: number }[]>`
    SELECT status, COUNT(*)::int AS count FROM cloud_index_sites GROUP BY status
  `;
  return Object.fromEntries(rows.map((r) => [r.status, r.count]));
}

export async function countSitesByTier(): Promise<Record<string, number>> {
  const db = getDb();
  const rows = await db<{ tier: string; count: number }[]>`
    SELECT tier, COUNT(*)::int AS count FROM cloud_index_sites GROUP BY tier
  `;
  return Object.fromEntries(rows.map((r) => [r.tier, r.count]));
}

export async function listAllSiteIdShorts(): Promise<Array<{ site_uid: string; site_id_short: string }>> {
  const db = getDb();
  return db<{ site_uid: string; site_id_short: string }[]>`
    SELECT site_uid, site_id_short FROM cloud_index_sites
  `;
}

export async function getOverviewStats(): Promise<{
  total_sites: number;
  by_status: Record<string, number>;
  by_tier: Record<string, number>;
  active_subscriptions: number;
  total_documents: number;
  avg_usage_percent: number;
}> {
  const db = getDb();
  const [totals] = await db<
    { total: number; active: number; total_documents: number; avg_usage: number | null }[]
  >`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status IN ('trialing', 'active'))::int AS active,
      COALESCE(SUM(document_count), 0)::int AS total_documents,
      AVG(
        CASE
          WHEN document_limit > 0 THEN (document_count::float / document_limit::float) * 100
          ELSE NULL
        END
      ) AS avg_usage
    FROM cloud_index_sites
  `;

  return {
    total_sites: totals?.total ?? 0,
    by_status: await countSitesByStatus(),
    by_tier: await countSitesByTier(),
    active_subscriptions: totals?.active ?? 0,
    total_documents: totals?.total_documents ?? 0,
    avg_usage_percent: Math.round(totals?.avg_usage ?? 0),
  };
}
