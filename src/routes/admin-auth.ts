import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  clearSessionCookie,
  createSessionToken,
  requireAdminSession,
  setSessionCookie,
  verifyAdminPassword,
  verifySessionToken,
  readSessionToken,
} from '../auth/admin-session.js';
import { isAdminEnabled } from '../config.js';

const loginBodySchema = z.object({
  password: z.string().min(1),
});

export async function registerAdminAuthRoutes(app: FastifyInstance) {
  app.post('/v1/admin/login', async (req, reply) => {
    if (!isAdminEnabled()) {
      return reply.code(503).send({ error: 'Admin dashboard is not configured' });
    }

    const parsed = loginBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() });
    }

    if (!verifyAdminPassword(parsed.data.password)) {
      return reply.code(401).send({ error: 'Invalid password' });
    }

    const token = createSessionToken();
    setSessionCookie(reply, token);
    return { ok: true };
  });

  app.post('/v1/admin/logout', async (req, reply) => {
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get('/v1/admin/me', async (req, reply) => {
    if (!isAdminEnabled()) {
      return reply.code(503).send({ error: 'Admin dashboard is not configured' });
    }

    if (!verifySessionToken(readSessionToken(req))) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    return { ok: true, admin: true };
  });
}

export { requireAdminSession };
