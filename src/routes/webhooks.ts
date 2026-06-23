import type { FastifyInstance } from 'fastify';
import { handleWebhook } from '../stripe/webhooks.js';

export async function registerWebhookRoutes(app: FastifyInstance) {
  app.post('/v1/stripe/webhook', { config: { rawBody: true } }, async (req, reply) => {
    const signature = String(req.headers['stripe-signature'] ?? '');
    if (!signature) {
      return reply.code(400).send({ error: 'Missing stripe-signature' });
    }

    const raw = (req as { rawBody?: Buffer }).rawBody;
    if (!raw) {
      return reply.code(400).send({ error: 'Missing raw body' });
    }

    try {
      await handleWebhook(raw, signature);
      return { received: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Webhook error';
      if (message.includes('No signatures found')) {
        req.log.warn(
          'Stripe webhook signature mismatch — STRIPE_WEBHOOK_SECRET must match the signing secret for this endpoint in the same Stripe mode (test vs live) as STRIPE_SECRET_KEY',
        );
      }
      return reply.code(400).send({ error: message });
    }
  });
}
