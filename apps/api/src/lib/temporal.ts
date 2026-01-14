// ===========================================
// Temporal Client for API
// ===========================================

import { Client, Connection } from '@temporalio/client';
import { logger } from '@salessearchers/shared';

const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ?? 'localhost:7233';
const TEMPORAL_NAMESPACE = process.env.TEMPORAL_NAMESPACE ?? 'default';
export const TASK_QUEUE = 'salessearchers-main';

let client: Client | null = null;
let connectionPromise: Promise<Client> | null = null;

/**
 * Get or create Temporal client (singleton)
 */
export async function getTemporalClient(): Promise<Client> {
  if (client) {
    return client;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    try {
      const connection = await Connection.connect({
        address: TEMPORAL_ADDRESS,
      });

      client = new Client({
        connection,
        namespace: TEMPORAL_NAMESPACE,
      });

      logger.info('Temporal client connected', { address: TEMPORAL_ADDRESS });
      return client;
    } catch (error) {
      logger.error('Failed to connect to Temporal', {}, error as Error);
      connectionPromise = null;
      throw error;
    }
  })();

  return connectionPromise;
}

/**
 * Start a meeting bot lifecycle workflow
 */
export async function startMeetingBotWorkflow(input: {
  meetingId: string;
  meetingUrl: string;
  tenantId: string;
  userId: string;
  scheduledAt?: string;
}) {
  const temporalClient = await getTemporalClient();

  const handle = await temporalClient.workflow.start('meetingBotLifecycleWorkflow', {
    taskQueue: TASK_QUEUE,
    workflowId: `meeting-bot-${input.meetingId}`,
    args: [input],
  });

  logger.info('Started meeting bot workflow', {
    workflowId: handle.workflowId,
    meetingId: input.meetingId,
  });

  return handle;
}

/**
 * Start a meeting insights workflow
 */
export async function startMeetingInsightsWorkflow(input: {
  meetingId: string;
  tenantId: string;
  userId: string;
  regenerate?: boolean;
}) {
  const temporalClient = await getTemporalClient();

  const handle = await temporalClient.workflow.start('meetingInsightsWorkflow', {
    taskQueue: TASK_QUEUE,
    workflowId: `meeting-insights-${input.meetingId}-${Date.now()}`,
    args: [input],
  });

  logger.info('Started meeting insights workflow', {
    workflowId: handle.workflowId,
    meetingId: input.meetingId,
  });

  return handle;
}

/**
 * Start a calendar sync workflow
 */
export async function startCalendarSyncWorkflow(input: {
  connectionId: string;
  tenantId: string;
  userId: string;
  continuous?: boolean;
}) {
  const temporalClient = await getTemporalClient();

  // Check if workflow already exists
  try {
    const existingHandle = temporalClient.workflow.getHandle(`calendar-sync-${input.connectionId}`);
    const description = await existingHandle.describe();
    
    if (description.status.name === 'RUNNING') {
      logger.info('Calendar sync workflow already running', {
        connectionId: input.connectionId,
      });
      return existingHandle;
    }
  } catch {
    // Workflow doesn't exist, create new one
  }

  const handle = await temporalClient.workflow.start('calendarSyncWorkflow', {
    taskQueue: TASK_QUEUE,
    workflowId: `calendar-sync-${input.connectionId}`,
    args: [input],
  });

  logger.info('Started calendar sync workflow', {
    workflowId: handle.workflowId,
    connectionId: input.connectionId,
  });

  return handle;
}

/**
 * Signal a meeting bot workflow to update status
 */
export async function signalMeetingBotStatus(meetingId: string, status: string) {
  const temporalClient = await getTemporalClient();
  
  try {
    const handle = temporalClient.workflow.getHandle(`meeting-bot-${meetingId}`);
    await handle.signal('botStatusChanged', { status });
    logger.info('Signaled meeting bot workflow', { meetingId, status });
  } catch (error) {
    logger.warn('Could not signal meeting bot workflow', { meetingId, error });
  }
}

/**
 * Cancel a meeting bot workflow
 */
export async function cancelMeetingBotWorkflow(meetingId: string) {
  const temporalClient = await getTemporalClient();
  
  try {
    const handle = temporalClient.workflow.getHandle(`meeting-bot-${meetingId}`);
    await handle.signal('cancelBot');
    logger.info('Cancelled meeting bot workflow', { meetingId });
  } catch (error) {
    logger.warn('Could not cancel meeting bot workflow', { meetingId, error });
  }
}

/**
 * Get workflow status
 */
export async function getWorkflowStatus(workflowId: string) {
  const temporalClient = await getTemporalClient();
  
  try {
    const handle = temporalClient.workflow.getHandle(workflowId);
    const description = await handle.describe();
    return {
      status: description.status.name,
      startTime: description.startTime,
      closeTime: description.closeTime,
    };
  } catch {
    return null;
  }
}

/**
 * Start an email sync workflow
 */
export async function startEmailSyncWorkflow(input: {
  connectionId: string;
  tenantId: string;
  userId: string;
  fullSync?: boolean;
}) {
  const temporalClient = await getTemporalClient();

  const handle = await temporalClient.workflow.start('emailSyncWorkflow', {
    taskQueue: TASK_QUEUE,
    workflowId: `email-sync-${input.connectionId}-${Date.now()}`,
    args: [input],
  });

  logger.info('Started email sync workflow', {
    workflowId: handle.workflowId,
    connectionId: input.connectionId,
  });

  return handle;
}

/**
 * Start a sequence enrollment workflow
 */
export async function startSequenceEnrollmentWorkflow(input: {
  enrollmentId: string;
  tenantId: string;
  sequenceId: string;
}) {
  const temporalClient = await getTemporalClient();

  const handle = await temporalClient.workflow.start('sequenceEnrollmentWorkflow', {
    taskQueue: TASK_QUEUE,
    workflowId: `sequence-enrollment-${input.enrollmentId}`,
    args: [input],
  });

  logger.info('Started sequence enrollment workflow', {
    workflowId: handle.workflowId,
    enrollmentId: input.enrollmentId,
  });

  return handle;
}

/**
 * Pause a sequence enrollment
 */
export async function pauseSequenceEnrollment(enrollmentId: string) {
  const temporalClient = await getTemporalClient();
  
  try {
    const handle = temporalClient.workflow.getHandle(`sequence-enrollment-${enrollmentId}`);
    await handle.signal('pauseEnrollment');
    logger.info('Paused sequence enrollment', { enrollmentId });
  } catch (error) {
    logger.warn('Could not pause enrollment workflow', { enrollmentId, error });
  }
}

/**
 * Resume a sequence enrollment
 */
export async function resumeSequenceEnrollment(enrollmentId: string) {
  const temporalClient = await getTemporalClient();
  
  try {
    const handle = temporalClient.workflow.getHandle(`sequence-enrollment-${enrollmentId}`);
    await handle.signal('resumeEnrollment');
    logger.info('Resumed sequence enrollment', { enrollmentId });
  } catch (error) {
    logger.warn('Could not resume enrollment workflow', { enrollmentId, error });
  }
}

