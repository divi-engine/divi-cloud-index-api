/**
 * Stripe product / price setup for Cloud Index tiers.
 *
 * Run: npm run stripe:setup
 *
 * Creates (or reuses) product "Divi Ajax Filter Cloud Index" and three recurring GBP prices.
 * Prints env vars for .env / deployment.
 */

import Stripe from 'stripe';
import { getEnv } from '../src/config.js';

const PRODUCT_NAME = 'Divi Ajax Filter Cloud Index';

const TIERS = [
  { key: 'STRIPE_PRICE_CLOUD_STARTER', name: 'Starter', amount: 1000, documents: 5000 },
  { key: 'STRIPE_PRICE_CLOUD_GROWTH', name: 'Growth', amount: 1800, documents: 25000 },
  { key: 'STRIPE_PRICE_CLOUD_SCALE', name: 'Scale', amount: 3500, documents: 100000 },
] as const;

async function main() {
  const stripe = new Stripe(getEnv().STRIPE_SECRET_KEY);

  const existing = await stripe.products.search({ query: `name:'${PRODUCT_NAME}'` });
  let product = existing.data[0];
  if (!product) {
    product = await stripe.products.create({
      name: PRODUCT_NAME,
      metadata: { plugin: 'divi-ajax-filter', feature: 'cloud-index' },
    });
    console.log('Created product:', product.id);
  } else {
    console.log('Using existing product:', product.id);
  }

  console.log('\nAdd these to your .env:\n');

  for (const tier of TIERS) {
    const price = await stripe.prices.create({
      product: product.id,
      currency: 'gbp',
      unit_amount: tier.amount,
      recurring: { interval: 'month' },
      metadata: {
        tier: tier.name.toLowerCase(),
        document_limit: String(tier.documents),
        trial_days: '14',
        plugin: 'divi-ajax-filter',
      },
    });
    console.log(`${tier.key}=${price.id}  # ${tier.name} £${(tier.amount / 100).toFixed(2)}/mo, ${tier.documents} docs`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
