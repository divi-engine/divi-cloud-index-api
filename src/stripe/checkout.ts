import type Stripe from 'stripe';
import { getEnv, priceIdForTier, type CloudTier } from '../config.js';
import { getStripe } from './client.js';
import { getSiteByUid, upsertSiteDraft, updateSite } from '../db/sites.js';

export async function createCheckoutSession(input: {
  siteUid: string;
  siteIdShort: string;
  siteUrl: string;
  tier: CloudTier;
  mode: 'trial' | 'subscribe';
  returnUrl: string;
}): Promise<{ url: string }> {
  const env = getEnv();
  const stripe = getStripe();

  let site = await getSiteByUid(input.siteUid);
  if (!site) {
    site = await upsertSiteDraft({
      siteUid: input.siteUid,
      siteIdShort: input.siteIdShort,
      siteUrl: input.siteUrl,
    });
  }

  if (input.mode === 'trial' && site.trial_used) {
    throw new Error('Trial already used for this site');
  }

  let customerId = site.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: {
        site_uid: input.siteUid,
        site_id_short: input.siteIdShort,
        plugin: 'divi-ajax-filter',
      },
    });
    customerId = customer.id;
    await updateSite(input.siteUid, { stripe_customer_id: customerId });
  }

  const priceId = priceIdForTier(input.tier);
  const successUrl = `${input.returnUrl}${input.returnUrl.includes('?') ? '&' : '?'}cloud_index=success`;
  const cancelUrl = `${input.returnUrl}${input.returnUrl.includes('?') ? '&' : '?'}cloud_index=cancelled`;

  const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
    metadata: {
      site_uid: input.siteUid,
      site_id_short: input.siteIdShort,
      tier: input.tier,
      plugin: 'divi-ajax-filter',
    },
  };

  if (input.mode === 'trial') {
    subscriptionData.trial_period_days = env.CLOUD_INDEX_TRIAL_DAYS;
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    metadata: {
      site_uid: input.siteUid,
      site_id_short: input.siteIdShort,
      site_url: input.siteUrl,
      tier: input.tier,
      plugin: 'divi-ajax-filter',
      checkout_mode: input.mode,
    },
    subscription_data: subscriptionData,
  });

  if (!session.url) {
    throw new Error('Stripe did not return a checkout URL');
  }

  return { url: session.url };
}

export async function createPortalSession(input: {
  siteUid: string;
  returnUrl: string;
}): Promise<{ url: string }> {
  const stripe = getStripe();
  const site = await getSiteByUid(input.siteUid);
  if (!site?.stripe_customer_id) {
    throw new Error('No billing account for this site');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: site.stripe_customer_id,
    return_url: input.returnUrl || getEnv().STRIPE_PORTAL_RETURN_URL,
  });

  return { url: session.url };
}
