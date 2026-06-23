import type Stripe from 'stripe';
import { getEnv, tierFromPriceId, TIER_LIMITS } from '../config.js';
import { getStripe } from './client.js';
import {
  getSiteByStripeCustomer,
  getSiteByStripeSubscription,
  getSiteByUid,
  updateSite,
  upsertSiteDraft,
} from '../db/sites.js';
import {
  applyTierFromStripe,
  deprovisionSite,
  provisionTypesenseForSite,
} from '../typesense/provision.js';

function mapStripeStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case 'trialing':
      return 'trialing';
    case 'active':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'canceled':
    case 'unpaid':
      return 'cancelled';
    default:
      return 'none';
  }
}

async function resolveSiteFromSubscription(sub: Stripe.Subscription) {
  const metaUid = sub.metadata?.site_uid;
  if (metaUid) {
    return getSiteByUid(metaUid);
  }
  const bySub = await getSiteByStripeSubscription(sub.id);
  if (bySub) {
    return bySub;
  }
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  if (customerId) {
    return getSiteByStripeCustomer(customerId);
  }
  return null;
}

export async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const siteUid = session.metadata?.site_uid;
  const siteIdShort = session.metadata?.site_id_short ?? '';
  const siteUrl = session.metadata?.site_url ?? '';
  const tier = (session.metadata?.tier ?? 'starter') as keyof typeof TIER_LIMITS;

  if (!siteUid) {
    return;
  }

  let site = await getSiteByUid(siteUid);
  if (!site) {
    site = await upsertSiteDraft({ siteUid, siteIdShort, siteUrl });
  }

  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  const subscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;

  const trialUsed = session.metadata?.checkout_mode === 'trial' || site.trial_used;

  await updateSite(siteUid, {
    stripe_customer_id: customerId ?? site.stripe_customer_id,
    stripe_subscription_id: subscriptionId ?? site.stripe_subscription_id,
    tier,
    document_limit: TIER_LIMITS[tier] ?? TIER_LIMITS.starter,
    trial_used: trialUsed,
  });

  if (subscriptionId) {
    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    await syncSubscriptionState(sub);
  } else {
    await provisionTypesenseForSite(siteUid);
    await updateSite(siteUid, { status: 'active' });
  }
}

export async function syncSubscriptionState(sub: Stripe.Subscription): Promise<void> {
  const site = await resolveSiteFromSubscription(sub);
  if (!site) {
    return;
  }

  const price = sub.items.data[0]?.price;
  const tier = price?.id ? tierFromPriceId(price.id) : (site.tier as 'starter' | 'growth' | 'scale');
  const status = mapStripeStatus(sub.status);

  const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
  const cancelAtPeriodEnd = sub.cancel_at_period_end;
  const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;

  let graceEnds: Date | null = site.grace_ends_at;
  if (status === 'cancelled' || cancelAtPeriodEnd) {
    graceEnds = periodEnd ?? new Date(Date.now() + getEnv().CLOUD_INDEX_CANCEL_GRACE_DAYS * 86400000);
  } else if (status === 'active' || status === 'trialing') {
    graceEnds = null;
  }

  await updateSite(site.site_uid, {
    status,
    tier,
    document_limit: TIER_LIMITS[tier],
    stripe_subscription_id: sub.id,
    stripe_customer_id:
      typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? site.stripe_customer_id,
    trial_ends_at: trialEnd,
    grace_ends_at: graceEnds,
    trial_used: site.trial_used || sub.status === 'trialing',
  });

  if (status === 'trialing' || status === 'active') {
    await provisionTypesenseForSite(site.site_uid);
  }

  if (status === 'cancelled' && graceEnds && graceEnds.getTime() <= Date.now()) {
    await deprovisionSite(site.site_uid);
  }
}

export async function handleSubscriptionDeleted(sub: Stripe.Subscription): Promise<void> {
  const site = await resolveSiteFromSubscription(sub);
  if (!site) {
    return;
  }

  const graceEnds = new Date(Date.now() + getEnv().CLOUD_INDEX_CANCEL_GRACE_DAYS * 86400000);
  await updateSite(site.site_uid, {
    status: 'cancelled',
    grace_ends_at: graceEnds,
  });
}

export async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const subId =
    typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
  if (!subId) {
    return;
  }
  const site = await getSiteByStripeSubscription(subId);
  if (!site) {
    return;
  }
  await updateSite(site.site_uid, { status: 'past_due' });
}

export async function handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
  const stripe = getStripe();
  const env = getEnv();
  const event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await syncSubscriptionState(event.data.object as Stripe.Subscription);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;
    case 'invoice.payment_failed':
      await handlePaymentFailed(event.data.object as Stripe.Invoice);
      break;
    default:
      break;
  }
}
