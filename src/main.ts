import Fastify, { type FastifyRequest } from 'fastify';
import { getEnv } from './config.js';
import { ensureSchema } from './db/sites.js';
import { registerSiteRoutes } from './routes/sites.js';
import { registerWebhookRoutes } from './routes/webhooks.js';

type RequestWithRawBody = FastifyRequest & { rawBody?: Buffer };

async function main() {
  const env = getEnv();
  await ensureSchema();

  const app = Fastify({
    logger: true,
    bodyLimit: 1048576,
  });

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

  await app.listen({ port: env.PORT, host: env.HOST });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
