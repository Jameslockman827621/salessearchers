import { proxyActivities, sleep } from '@temporalio/workflow';
import type * as activities from '../activities';

const {
  getEmailConnection,
  refreshEmailToken,
  fetchGmailThreads,
  fetchGmailMessages,
  upsertEmailThreads,
  upsertEmailMessages,
  updateEmailSyncCursor,
  detectReplies,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  retry: {
    maximumAttempts: 3,
  },
});

export interface EmailSyncInput {
  connectionId: string;
  tenantId: string;
}

/**
 * Workflow to sync emails from a connected email provider (Gmail)
 * Runs periodically or on-demand to fetch new messages
 */
export async function emailSyncWorkflow(input: EmailSyncInput): Promise<void> {
  const { connectionId, tenantId } = input;

  // Get connection details
  const connection = await getEmailConnection({ connectionId });
  if (!connection || !connection.isActive) {
    return;
  }

  // Refresh token if needed
  if (connection.expiresAt && new Date(connection.expiresAt) < new Date()) {
    await refreshEmailToken({ connectionId, provider: connection.provider });
  }

  // Get updated connection after potential token refresh
  const updatedConnection = await getEmailConnection({ connectionId });
  if (!updatedConnection) return;

  // Fetch threads from Gmail
  const threads = await fetchGmailThreads({
    connectionId,
    accessToken: updatedConnection.accessToken,
    maxResults: 50,
  });

  if (threads.length === 0) {
    await updateEmailSyncCursor({ connectionId });
    return;
  }

  // Upsert threads to database
  await upsertEmailThreads({
    connectionId,
    tenantId,
    threads,
  });

  // For each thread, fetch full messages
  for (const thread of threads) {
    const messages = await fetchGmailMessages({
      connectionId,
      accessToken: updatedConnection.accessToken,
      threadId: thread.id,
    });

    await upsertEmailMessages({
      connectionId,
      tenantId,
      threadId: thread.id,
      messages,
    });

    // Small delay between threads to avoid rate limiting
    await sleep(100);
  }

  // Update sync cursor
  await updateEmailSyncCursor({ connectionId });

  // Detect replies to sequence emails
  await detectReplies({ connectionId, tenantId });
}
