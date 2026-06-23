import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verifyPluginRequest } from '../auth/hmac.js';
import { upsertSiteDraft, getSiteByUid } from '../db/sites.js';
import { createCheckoutSession, createPortalSession } from '../stripe/checkout.js';
import { maybeReconcileSubscriptionFromStripe } from '../stripe/reconcile.js';
import {
  buildStatusPayload,
  getStoredApiKeyForSite,
  refreshDocumentCount,
  refreshKeyCollections,
} from '../typesense/provision.js';
import type { CloudTier } from '../config.js';

const statusQuerySchema = z.object({
  site_uid: z.string().uuid(),
  site_id_short: z.string().min(4).max(16),
  site_url: z.string().url().or(z.literal('')),
});

const checkoutBodySchema = z.object({
  site_uid: z.string().uuid(),
  site_id_short: z.string().min(4).max(16),
  site_url: z.string().url().or(z.literal('')),
  tier: z.enum(['starter', 'growth', 'scale']).default('starter'),
  mode: z.enum(['trial', 'subscribe']).default('trial'),
  return_url: z.string().url(),
});

const portalBodySchema = z.object({
  site_uid: z.string().uuid(),
  return_url: z.string().url(),
});

export async function registerSiteRoutes(app: FastifyInstance) {
  app.get('/v1/sites/status', async (req, reply) => {
    const auth = verifyPluginRequest(req);
    if (!auth.ok) {
      return reply.code(401).send({ error: auth.message });
    }

    const parsed = statusQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid query', details: parsed.error.flatten() });
    }

    const { site_uid, site_id_short, site_url } = parsed.data;
    let site = await getSiteByUid(site_uid);
    if (!site) {
      site = await upsertSiteDraft({ siteUid: site_uid, siteIdShort: site_id_short, siteUrl: site_url });
    } else {
      site = await upsertSiteDraft({ siteUid: site_uid, siteIdShort: site_id_short, siteUrl: site_url });
    }

    await refreshKeyCollections(site);
    await refreshDocumentCount(site);
    site = (await getSiteByUid(site_uid))!;

    site = await maybeReconcileSubscriptionFromStripe(site);

    const apiKey = getStoredApiKeyForSite(site);
    return buildStatusPayload(site, apiKey);
  });

  app.post('/v1/sites/checkout', async (req, reply) => {
    const auth = verifyPluginRequest(req);
    if (!auth.ok) {
      return reply.code(401).send({ error: auth.message });
    }

    const parsed = checkoutBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() });
    }

    const body = parsed.data;
    try {
      const result = await createCheckoutSession({
        siteUid: body.site_uid,
        siteIdShort: body.site_id_short,
        siteUrl: body.site_url,
        tier: body.tier as CloudTier,
        mode: body.mode,
        returnUrl: body.return_url,
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Checkout failed';
      return reply.code(400).send({ error: message });
    }
  });

  app.post('/v1/sites/portal', async (req, reply) => {
    const auth = verifyPluginRequest(req);
    if (!auth.ok) {
      return reply.code(401).send({ error: auth.message });
    }

    const parsed = portalBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() });
    }

    try {
      const result = await createPortalSession({
        siteUid: parsed.data.site_uid,
        returnUrl: parsed.data.return_url,
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Portal failed';
      return reply.code(400).send({ error: message });
    }
  });
}
