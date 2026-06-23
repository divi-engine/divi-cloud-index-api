import type { CloudIndexSiteRow } from '../db/sites.js';
import { getSiteByUid } from '../db/sites.js';
import { isSubscriptionUsable } from '../typesense/provision.js';
import { getStripe } from './client.js';
import { syncSubscriptionState } from './webhooks.js';

/**
 * When Stripe webhooks were missed, pull subscription state from Stripe on status refresh.
 */
export async function maybeReconcileSubscriptionFromStripe(
  site: CloudIndexSiteRow,
): Promise<CloudIndexSiteRow> {
  if (isSubscriptionUsable(site.status) && site.typesense_key_id) {
    return site;
  }

  const stripe = getStripe();

  if (site.stripe_subscription_id) {
    try {
      const sub = await stripe.subscriptions.retrieve(site.stripe_subscription_id);
      await syncSubscriptionState(sub);
      return (await getSiteByUid(site.site_uid)) ?? site;
    } catch {
      // Fall through to customer subscription list.
    }
  }

  if (!site.stripe_customer_id) {
    return site;
  }

  const { data } = await stripe.subscriptions.list({
    customer: site.stripe_customer_id,
    status: 'all',
    limit: 10,
  });

  const preferred =
    data.find((s) => s.status === 'trialing' || s.status === 'active') ??
    data.find((s) => s.status === 'past_due') ??
    data[0];

  if (preferred) {
    await syncSubscriptionState(preferred);
    return (await getSiteByUid(site.site_uid)) ?? site;
  }

  return site;
}
