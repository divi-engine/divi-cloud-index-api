import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { toPublicSite } from '../admin/site-public.js';
import { requireAdminSession } from '../auth/admin-session.js';
import {
  getOverviewStats,
  getSiteByUid,
  getSiteByUidPublic,
  listAllSiteIdShorts,
  listAllSites,
} from '../db/sites.js';
import { getMrrSummary, getMonthlyEarnings } from '../stripe/reports.js';
import { buildTypesenseReport } from '../typesense/admin.js';
import { collectionPrefix, refreshDocumentCount } from '../typesense/provision.js';

const customersQuerySchema = z.object({
  status: z.string().optional(),
  tier: z.enum(['starter', 'growth', 'scale']).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const earningsQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

async function adminPreHandler(
  req: Parameters<typeof requireAdminSession>[0],
  reply: Parameters<typeof requireAdminSession>[1]
) {
  await requireAdminSession(req, reply);
}

export async function registerAdminReportRoutes(app: FastifyInstance) {
  app.get(
    '/v1/admin/overview',
    { preHandler: adminPreHandler },
    async (_req, reply) => {
      if (reply.sent) {
        return;
      }

      const [stats, mrr] = await Promise.all([getOverviewStats(), getMrrSummary()]);
      return {
        stats,
        mrr,
      };
    }
  );

  app.get(
    '/v1/admin/customers',
    { preHandler: adminPreHandler },
    async (req, reply) => {
      if (reply.sent) {
        return;
      }

      const parsed = customersQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid query', details: parsed.error.flatten() });
      }

      const result = await listAllSites(parsed.data);
      return {
        total: result.total,
        limit: parsed.data.limit ?? 50,
        offset: parsed.data.offset ?? 0,
        customers: result.sites.map(toPublicSite),
      };
    }
  );

  app.get(
    '/v1/admin/customers/:siteUid',
    { preHandler: adminPreHandler },
    async (req, reply) => {
      if (reply.sent) {
        return;
      }

      const siteUid = (req.params as { siteUid: string }).siteUid;
      if (!z.string().uuid().safeParse(siteUid).success) {
        return reply.code(400).send({ error: 'Invalid site UID' });
      }

      const site = await getSiteByUidPublic(siteUid);
      if (!site) {
        return reply.code(404).send({ error: 'Site not found' });
      }

      return {
        customer: toPublicSite(site),
        typesense_prefix: collectionPrefix(site.site_id_short),
      };
    }
  );

  app.post(
    '/v1/admin/customers/:siteUid/refresh-usage',
    { preHandler: adminPreHandler },
    async (req, reply) => {
      if (reply.sent) {
        return;
      }

      const siteUid = (req.params as { siteUid: string }).siteUid;
      if (!z.string().uuid().safeParse(siteUid).success) {
        return reply.code(400).send({ error: 'Invalid site UID' });
      }

      const site = await getSiteByUid(siteUid);
      if (!site) {
        return reply.code(404).send({ error: 'Site not found' });
      }

      const count = await refreshDocumentCount(site);
      const updated = await getSiteByUidPublic(siteUid);
      return {
        document_count: count,
        customer: updated ? toPublicSite(updated) : null,
      };
    }
  );

  app.get(
    '/v1/admin/typesense',
    { preHandler: adminPreHandler },
    async (_req, reply) => {
      if (reply.sent) {
        return;
      }

      const sites = await listAllSiteIdShorts();
      const report = await buildTypesenseReport(sites);
      return report;
    }
  );

  app.get(
    '/v1/admin/earnings',
    { preHandler: adminPreHandler },
    async (req, reply) => {
      if (reply.sent) {
        return;
      }

      const parsed = earningsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid query', details: parsed.error.flatten() });
      }

      try {
        const [mrr, earnings] = await Promise.all([
          getMrrSummary(),
          getMonthlyEarnings(parsed.data.month),
        ]);
        return { mrr, earnings };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load earnings';
        return reply.code(400).send({ error: message });
      }
    }
  );
}
