// ===========================================
// Temporal Worker Entry Point
// ===========================================

import { Worker, NativeConnection } from '@temporalio/worker';
import * as activities from './activities';
import { logger } from '@salessearchers/shared';

const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ?? 'localhost:7233';
const TASK_QUEUE = 'salessearchers-main';

async function main() {
  try {
    // Connect to Temporal
    const connection = await NativeConnection.connect({
      address: TEMPORAL_ADDRESS,
    });

    // Create worker
    const worker = await Worker.create({
      connection,
      namespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
      taskQueue: TASK_QUEUE,
      workflowsPath: require.resolve('./workflows'),
      activities,
    });

    logger.info('🔧 Temporal worker started', {
      taskQueue: TASK_QUEUE,
      address: TEMPORAL_ADDRESS,
    });

    // Start worker
    await worker.run();
  } catch (error) {
    logger.error('Failed to start worker', {}, error as Error);
    process.exit(1);
  }
}

main();
