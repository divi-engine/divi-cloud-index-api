# Divi Cloud Index API

Provisioning API for **Divi Ajax Filter Cloud index**: Stripe billing, Typesense scoped keys, and trial cleanup.

## Setup

```bash
npm install
cp .env.example .env
# Apply sql/schema.sql to Postgres
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
