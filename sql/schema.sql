-- Cloud index site registry (run against Postgres)

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

CREATE INDEX IF NOT EXISTS cloud_index_sites_status_idx ON cloud_index_sites (status);
CREATE INDEX IF NOT EXISTS cloud_index_sites_stripe_customer_idx ON cloud_index_sites (stripe_customer_id);
CREATE INDEX IF NOT EXISTS cloud_index_sites_stripe_subscription_idx ON cloud_index_sites (stripe_subscription_id);
