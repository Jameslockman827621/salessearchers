// ===========================================
// Calendar Sync Workflow
// ===========================================

import { proxyActivities, sleep, continueAsNew } from '@temporalio/workflow';
import type * as activities from '../activities';

const {
  getCalendarConnection,
  refreshCalendarToken,
  fetchCalendarEvents,
  upsertCalendarEvents,
  scheduleRecordingsForConnection,
  updateCalendarSyncCursor,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  retry: {
    maximumAttempts: 3,
    initialInterval: '10 seconds',
    backoffCoefficient: 2,
  },
});

export interface CalendarSyncInput {
  connectionId: string;
  tenantId: string;
  userId: string;
  continuous?: boolean;
}

export async function calendarSyncWorkflow(input: CalendarSyncInput): Promise<void> {
  const { connectionId, tenantId, userId, continuous } = input;

  // Get connection details
  const connection = await getCalendarConnection({ connectionId });
  
  if (!connection || !connection.isActive) {
    console.log('Calendar connection not found or inactive');
    return;
  }

  // Refresh token if expired
  if (connection.expiresAt && new Date(connection.expiresAt) < new Date()) {
    await refreshCalendarToken({ connectionId, provider: connection.provider });
  }

  // Fetch events from calendar API
  const events = await fetchCalendarEvents({
    connectionId,
    provider: connection.provider,
    accessToken: connection.accessToken,
    syncCursor: connection.syncCursor,
  });

  // Upsert events to database
  if (events.events.length > 0) {
    await upsertCalendarEvents({
      connectionId,
      events: events.events,
    });
  }

  // Update sync cursor
  if (events.nextSyncCursor) {
    await updateCalendarSyncCursor({
      connectionId,
      cursor: events.nextSyncCursor,
    });
  }

  // Schedule recordings based on recording policy
  await scheduleRecordingsForConnection({
    connectionId,
    tenantId,
    userId,
  });

  // If continuous mode, wait and sync again
  if (continuous) {
    // Wait 5 minutes before next sync
    await sleep('5 minutes');
    
    // Continue as new to avoid history buildup
    await continueAsNew<typeof calendarSyncWorkflow>(input);
  }
}
