import {
  type CloudIndexSiteRow,
  getSiteByUid,
  updateSite,
} from '../db/sites.js';
import { readStoredApiKey, storeApiKey } from '../auth/hmac.js';
import {
  countDocumentsForPrefix,
  createScopedSearchKey,
  deleteCollectionsForPrefix,
  listCollectionsForPrefix,
  revokeKey,
  updateKeyCollections,
} from './admin.js';
import { TIER_LIMITS, type CloudTier, type SubscriptionStatus } from '../config.js';

export function collectionPrefix(siteIdShort: string): string {
  return `de_${siteIdShort}_`;
}

export async function refreshDocumentCount(site: CloudIndexSiteRow): Promise<number> {
  const count = await countDocumentsForPrefix(collectionPrefix(site.site_id_short));
  await updateSite(site.site_uid, { document_count: count });
  return count;
}

export async function refreshKeyCollections(site: CloudIndexSiteRow): Promise<void> {
  if (!site.typesense_key_id) {
    return;
  }
  const collections = await listCollectionsForPrefix(collectionPrefix(site.site_id_short));
  const names = collections.map((c) => c.name);
  if (names.length > 0) {
    await updateKeyCollections(site.typesense_key_id, names);
  }
}

export async function provisionTypesenseForSite(siteUid: string): Promise<{ apiKey: string } | null> {
  const site = await getSiteByUid(siteUid);
  if (!site) {
    return null;
  }

  if (site.typesense_key_id) {
    await revokeKey(site.typesense_key_id);
  }

  const prefix = collectionPrefix(site.site_id_short);
  const existing = await listCollectionsForPrefix(prefix);
  const names = existing.map((c) => c.name);

  const key = await createScopedSearchKey(site.site_id_short, names);
  const apiKey = key.value;

  await updateSite(siteUid, {
    typesense_key_id: key.id,
    api_key_ciphertext: storeApiKey(apiKey),
  });

  return { apiKey };
}

export async function deprovisionSite(siteUid: string): Promise<void> {
  const site = await getSiteByUid(siteUid);
  if (!site) {
    return;
  }

  if (site.typesense_key_id) {
    try {
      await revokeKey(site.typesense_key_id);
    } catch {
      // Key may already be gone.
    }
  }

  await deleteCollectionsForPrefix(collectionPrefix(site.site_id_short));

  await updateSite(siteUid, {
    status: 'expired',
    typesense_key_id: null,
    api_key_ciphertext: null,
    stripe_subscription_id: null,
    trial_ends_at: null,
    grace_ends_at: null,
    document_count: 0,
  });
}

export function isSubscriptionUsable(status: string): boolean {
  return status === 'trialing' || status === 'active';
}

export function buildStatusPayload(site: CloudIndexSiteRow, apiKey: string | null) {
  return {
    site_uid: site.site_uid,
    status: site.status as SubscriptionStatus,
    tier: site.tier as CloudTier,
    document_limit: site.document_limit,
    document_count: site.document_count,
    trial_ends_at: site.trial_ends_at ? site.trial_ends_at.toISOString() : null,
    grace_ends_at: site.grace_ends_at ? site.grace_ends_at.toISOString() : null,
    trial_used: site.trial_used,
    api_key: isSubscriptionUsable(site.status) ? apiKey : null,
    can_sync: isSubscriptionUsable(site.status) && site.document_count < site.document_limit,
  };
}

export async function applyTierFromStripe(siteUid: string, tier: CloudTier): Promise<void> {
  await updateSite(siteUid, {
    tier,
    document_limit: TIER_LIMITS[tier],
  });
}

export function getStoredApiKeyForSite(site: CloudIndexSiteRow): string | null {
  return readStoredApiKey(site.api_key_ciphertext);
}
