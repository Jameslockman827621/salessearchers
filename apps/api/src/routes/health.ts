// ===========================================
// Health Check Routes
// ===========================================

import { FastifyInstance } from 'fastify';
import { prisma } from '@salessearchers/db';

export async function healthRoutes(app: FastifyInstance) {
  // Basic health check
  app.get('/', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '0.0.0',
    };
  });

  // Detailed health check
  app.get('/ready', async () => {
    const checks: Record<string, { status: 'ok' | 'error'; latency?: number; error?: string }> = {};

    // Database check
    const dbStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'ok', latency: Date.now() - dbStart };
    } catch (error) {
      checks.database = { status: 'error', error: (error as Error).message };
    }

    // Calculate overall status
    const isHealthy = Object.values(checks).every((c) => c.status === 'ok');

    return {
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    };
  });

  // Liveness probe (for kubernetes)
  app.get('/live', async () => {
    return { status: 'ok' };
  });
}
