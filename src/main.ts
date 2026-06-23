import Fastify, { type FastifyRequest } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getEnv } from './config.js';
import { ensureSchema } from './db/sites.js';
import { registerAdminAuthRoutes } from './routes/admin-auth.js';
import { registerAdminReportRoutes } from './routes/admin-reports.js';
import { registerSiteRoutes } from './routes/sites.js';
import { registerWebhookRoutes } from './routes/webhooks.js';

type RequestWithRawBody = FastifyRequest & { rawBody?: Buffer };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminDistPath = path.join(__dirname, '../../admin/dist');

async function main() {
  const env = getEnv();
  await ensureSchema();

  const app = Fastify({
    logger: true,
    bodyLimit: 1048576,
  });

  await app.register(fastifyCookie);

  // Stripe sends `application/json; charset=utf-8`. Fastify's default JSON parser runs for that
  // media type and does not set rawBody — remove it and replace with a buffer parser (mediaType
  // fallback covers charset variants).
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    try {
      (req as RequestWithRawBody).rawBody = body as Buffer;
      const text = (body as Buffer).toString('utf8');
      done(null, text ? JSON.parse(text) : {});
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  app.get('/health', async () => ({ ok: true }));

  await registerSiteRoutes(app);
  await registerWebhookRoutes(app);
  await registerAdminAuthRoutes(app);
  await registerAdminReportRoutes(app);

  try {
    const indexHtml = readFileSync(path.join(adminDistPath, 'index.html'), 'utf8');

    await app.register(fastifyStatic, {
      root: adminDistPath,
      prefix: '/admin/',
      decorateReply: true,
    });

    app.get('/admin', async (_req, reply) => {
      reply.type('text/html').send(indexHtml);
    });

    app.get('/admin/*', async (req, reply) => {
      if (req.url.includes('/assets/')) {
        return reply.callNotFound();
      }
      reply.type('text/html').send(indexHtml);
    });
  } catch {
    app.log.warn('Admin SPA not built — run npm run build:admin');
  }

  await app.listen({ port: env.PORT, host: env.HOST });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
