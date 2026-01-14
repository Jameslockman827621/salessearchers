// ===========================================
// Temporal Client Helper
// ===========================================

import { Client, Connection } from '@temporalio/client';

const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ?? 'localhost:7233';
const TEMPORAL_NAMESPACE = process.env.TEMPORAL_NAMESPACE ?? 'default';
export const TASK_QUEUE = 'salessearchers-main';

let client: Client | null = null;

/**
 * Get or create Temporal client
 */
export async function getTemporalClient(): Promise<Client> {
  if (!client) {
    const connection = await Connection.connect({
      address: TEMPORAL_ADDRESS,
    });

    client = new Client({
      connection,
      namespace: TEMPORAL_NAMESPACE,
    });
  }

  return client;
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

  return temporalClient.workflow.start('meetingBotLifecycleWorkflow', {
    taskQueue: TASK_QUEUE,
    workflowId: `meeting-bot-${input.meetingId}`,
    args: [input],
  });
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

  return temporalClient.workflow.start('meetingInsightsWorkflow', {
    taskQueue: TASK_QUEUE,
    workflowId: `meeting-insights-${input.meetingId}-${Date.now()}`,
    args: [input],
  });
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

  return temporalClient.workflow.start('calendarSyncWorkflow', {
    taskQueue: TASK_QUEUE,
    workflowId: `calendar-sync-${input.connectionId}`,
    args: [input],
  });
}

/**
 * Signal a workflow to cancel the bot
 */
export async function cancelMeetingBot(meetingId: string) {
  const temporalClient = await getTemporalClient();
  const handle = temporalClient.workflow.getHandle(`meeting-bot-${meetingId}`);
  await handle.signal('cancelBot');
}

