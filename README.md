# Divi Cloud Index API

Provisioning API for **Divi Ajax Filter Cloud index**: Stripe billing, Typesense scoped keys, and trial cleanup.

## Architecture

| Service | Where it runs | Purpose |
|---------|---------------|---------|
| **Typesense** | Docker on `cloud-catalog.diviengine.com` | Search index (documents live here) |
| **This API** | `cloud-index.diviengine.com` (separate deploy) | Stripe billing, scoped key provisioning |
| **Postgres (Supabase)** | Supabase project | Site registry: subscription status, tier, limits, encrypted scoped keys |

Typesense does **not** use Postgres. Supabase is only for this API’s billing/registry data.

## Setup

```bash
npm install
cp .env.example .env
```

### Supabase (Postgres)

1. Create a project at [supabase.com](https://supabase.com) (pick a region close to where the API will run).
2. Open your project → click **Connect** (top of the project home page, not under Settings).  
   If you don’t see it, use **Connect to your project** from the overview, or open:  
   `https://supabase.com/dashboard/project/YOUR_PROJECT_REF?showConnect=true`
3. Choose **Session pooler** (port **5432**) — **not** Direct connection (`db.*.supabase.co` is IPv6-only and often fails on Windows with `ENOTFOUND`).
4. Copy the **URI** and set `DATABASE_URL` in `.env` (user looks like `postgres.your_project_ref`, host like `aws-0-REGION.pooler.supabase.com`).
5. **SQL Editor → New query** — paste and run `sql/schema.sql` (creates `cloud_index_sites` + indexes).

The API also calls `ensureSchema()` on startup (table only); running `schema.sql` once in Supabase is the canonical setup.

Do **not** put the Supabase **service role** key in the WordPress plugin — only `DATABASE_URL` in this API’s `.env`.

```bash
npm run stripe:setup   # creates Stripe prices, prints env vars
npm run dev
```

## Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/health` | — | Liveness |
| GET | `/v1/sites/status` | HMAC headers | Subscription + usage + API key |
| POST | `/v1/sites/checkout` | HMAC | Stripe Checkout URL |
| POST | `/v1/sites/portal` | HMAC | Stripe Customer Portal URL |
| POST | `/v1/stripe/webhook` | Stripe signature | Billing events |

### Plugin auth headers

- `X-DE-Site-Uid` — UUID from `daf_catalog_site_uid`
- `X-DE-Site-Url` — site home URL
- `X-DE-Timestamp` — Unix seconds
- `X-DE-Signature` — `HMAC-SHA256(PLUGIN_HMAC_SECRET, timestamp.site_uid.site_url.body_json)`

## Cron

```bash
npm run cron:cleanup   # daily — revoke keys + delete collections after trial/grace
npm run cron:usage     # weekly — reconcile document counts
```

## Tiers

| Tier | Price | Documents |
|------|-------|-----------|
| Starter | £10/mo | 5,000 |
| Growth | £18/mo | 25,000 |
| Scale | £35/mo | 100,000 |

14-day trial on Starter limits (card required via Stripe Checkout).

## Production deploy (`cloud-index.diviengine.com`)

The API runs on the **same Hetzner box as Typesense** by default (Caddy adds a second site; Typesense stays on `cloud-catalog.diviengine.com`).

### 1. DNS

Add an **A record**: `cloud-index.diviengine.com` → same IP as `cloud-catalog` (e.g. `5.161.61.154`). Grey cloud is fine for Let’s Encrypt.

### 2. Production `.env` on the server

Copy your working local `.env` to the server (never commit it). Use **live** Stripe keys and a **production** webhook secret from the Stripe Dashboard:

```bash
# From your PC (Git Bash), in divi-cloud-index-api/
scp .env root@5.161.61.154:/opt/divi-cloud-index-api/.env
```

If the directory does not exist yet, create it first on the server: `mkdir -p /opt/divi-cloud-index-api`.

### 3. Run the setup script (on the server)

Upload the script (or clone the repo), fix Windows line endings if needed, then run:

```bash
# On the server
sed -i 's/\r$//' setup-api-server.sh   # if copied from Windows
bash setup-api-server.sh cloud-index.diviengine.com /opt/divi-cloud-typesense
```

The script installs Node 20, clones `divi-engine/divi-cloud-index-api` if needed, builds, enables **systemd**, appends **Caddy** for HTTPS, and installs **cron** for cleanup/usage jobs.

### 4. Verify

```bash
curl -s https://cloud-index.diviengine.com/health
# {"ok":true}
```

### 5. Stripe webhook (production)

In Stripe Dashboard → Webhooks → add endpoint:

- URL: `https://cloud-index.diviengine.com/v1/stripe/webhook`
- Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- Put the signing secret in server `.env` as `STRIPE_WEBHOOK_SECRET` and restart: `systemctl restart divi-cloud-index-api`

**Test vs live:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the Stripe Dashboard mode must all match. A test checkout (`livemode: false`) requires **test** API keys and the **test** webhook endpoint signing secret (`whsec_…` from the **cloud-index** destination in Test mode). Mixing a live webhook secret with test events (or vice versa) returns HTTP 400: *No signatures found matching the expected signature*.

After updating `.env`, use **Resend** on failed events in Stripe → Webhooks → cloud-index, or run a fresh checkout.

### 6. WordPress (Divi Ajax Filter)

**Customer sites:** no `wp-config.php` changes. The plugin ships production endpoints and the plugin client signing key in `includes/search/cloud-index-service-config.php`. After Stripe checkout, the per-site Typesense API key is saved in plugin settings automatically.

**Staging only** — override in `wp-config.php`:

```php
define( 'DAF_CLOUD_INDEX_API_URL', 'https://cloud-index.staging.example.com' );
define( 'DAF_CLOUD_INDEX_API_SIGNING_KEY', '...' ); // must match PLUGIN_HMAC_SECRET on that API
define( 'DAF_CLOUD_TYPESENSE_HOST', 'cloud-catalog.staging.example.com' );
```

### Updates

**Recommended — push to `publish` branch** (GitHub Actions):

1. Merge changes to `main`, then merge or push to branch **`publish`**.
2. Workflow **Publish to production** rsyncs code to the server, runs `npm ci` / `npm run build`, and restarts `divi-cloud-index-api`.
3. Server `.env` is **never** overwritten.

Required repo secret: **`DEPLOY_SSH_PRIVATE_KEY`** (same pattern as CutBench — add under Settings → Secrets and variables → Actions).

Optional variables (defaults shown):

| Variable | Default |
|----------|---------|
| `DEPLOY_HOST` | `62.238.38.194` |
| `DEPLOY_USER` | `root` |
| `DEPLOY_PATH` | `/opt/divi-cloud-index-api` |

**Manual — on the server** (git pull):

```bash
bash /opt/divi-cloud-index-api/scripts/deploy-api-update.sh
```

**Manual — after rsync from your PC:**

```bash
REMOTE_DIR=/opt/divi-cloud-index-api bash /opt/divi-cloud-index-api/scripts/deploy-remote.sh
```
