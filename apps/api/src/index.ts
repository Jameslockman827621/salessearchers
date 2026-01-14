// ===========================================
// API Entry Point
// ===========================================

import { buildApp } from './app';
import { logger } from '@salessearchers/shared';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

async function main() {
  try {
    const app = await buildApp();

    await app.listen({ port: PORT, host: HOST });

    logger.info(`🚀 API server running on http://${HOST}:${PORT}`);
  } catch (error) {
    logger.error('Failed to start server', {}, error as Error);
    process.exit(1);
  }
}

main();
