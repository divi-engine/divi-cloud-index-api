import Fastify from 'fastify';
import { getEnv } from './config.js';
import { ensureSchema } from './db/sites.js';
import { registerSiteRoutes } from './routes/sites.js';
import { registerWebhookRoutes } from './routes/webhooks.js';

async function main() {
  const env = getEnv();
  await ensureSchema();

  const app = Fastify({
    logger: true,
    bodyLimit: 1048576,
  });

  // Match application/json with optional charset so Stripe's raw body is preserved for signing.
  app.addContentTypeParser(/^application\/json(?:;.*)?$/i, { parseAs: 'buffer' }, (req, body, done) => {
    try {
      (req as { rawBody?: Buffer }).rawBody = body as Buffer;
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
