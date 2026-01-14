// ===========================================
// Request Context Plugin
// ===========================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

async function requestContextPlugin(app: FastifyInstance) {
  // Add request timing
  app.addHook('onRequest', async (request: FastifyRequest) => {
    (request as unknown as { startTime: bigint }).startTime = process.hrtime.bigint();
  });

  // Log request completion with timing
  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = (request as unknown as { startTime: bigint }).startTime;
    const duration = Number(process.hrtime.bigint() - startTime) / 1_000_000; // Convert to ms

    if (process.env.NODE_ENV !== 'production') {
      const statusColor = reply.statusCode >= 400 ? '\x1b[31m' : '\x1b[32m';
      console.log(
        `${statusColor}${reply.statusCode}\x1b[0m ${request.method} ${request.url} - ${duration.toFixed(2)}ms`
      );
    }
  });
}

export const requestContext = fp(requestContextPlugin, {
  name: 'request-context',
});
