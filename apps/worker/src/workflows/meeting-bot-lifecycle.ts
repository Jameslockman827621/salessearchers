// ===========================================
// Meeting Bot Lifecycle Workflow
// ===========================================

import {
  proxyActivities,
  defineSignal,
  setHandler,
  sleep,
  condition,
  workflowInfo,
} from '@temporalio/workflow';
import type * as activities from '../activities';

const { 
  createRecallBot, 
  joinMeeting, 
  getMeetingStatus,
  downloadRecording,
  processTranscript,
  updateMeetingStatus,
  triggerInsightsWorkflow,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  retry: {
    maximumAttempts: 3,
    initialInterval: '10 seconds',
    backoffCoefficient: 2,
  },
});

export interface MeetingBotInput {
  meetingId: string;
  meetingUrl: string;
  tenantId: string;
  userId: string;
  scheduledAt?: string;
}

export const botStatusChanged = defineSignal<[{ status: string }]>('botStatusChanged');
export const cancelBot = defineSignal('cancelBot');

export async function meetingBotLifecycleWorkflow(input: MeetingBotInput): Promise<void> {
  const { meetingId, meetingUrl, tenantId, userId, scheduledAt } = input;
  
  let currentStatus = 'scheduled';
  let cancelled = false;
  let botCreated = false;

  // Handle status signals from webhooks
  setHandler(botStatusChanged, ({ status }) => {
    currentStatus = status;
  });

  // Handle cancellation
  setHandler(cancelBot, () => {
    cancelled = true;
  });

  // If scheduled for future, wait until 2 minutes before
  if (scheduledAt) {
    const scheduledTime = new Date(scheduledAt).getTime();
    const joinTime = scheduledTime - 2 * 60 * 1000; // 2 minutes before
    const waitMs = joinTime - Date.now();

    if (waitMs > 0) {
      // Wait but check for cancellation every minute
      const waitUntil = Date.now() + waitMs;
      while (Date.now() < waitUntil && !cancelled) {
        await sleep(Math.min(60_000, waitUntil - Date.now()));
      }
    }
  }

  if (cancelled) {
    await updateMeetingStatus({ meetingId, status: 'CANCELLED' });
    return;
  }

  try {
    // Create bot and join meeting
    await updateMeetingStatus({ meetingId, status: 'BOT_JOINING' });
    
    const botResult = await createRecallBot({
      meetingId,
      meetingUrl,
      tenantId,
      webhookUrl: `${process.env.API_URL ?? 'http://localhost:3001'}/api/webhooks/recall`,
    });
    
    botCreated = true;

    // Wait for bot to join (max 5 minutes)
    const joinResult = await condition(
      () => ['in_call_recording', 'fatal', 'done'].includes(currentStatus) || cancelled,
      '5 minutes'
    );

    if (cancelled || currentStatus === 'fatal') {
      await updateMeetingStatus({ 
        meetingId, 
        status: currentStatus === 'fatal' ? 'FAILED' : 'CANCELLED' 
      });
      return;
    }

    // Bot is recording
    await updateMeetingStatus({ meetingId, status: 'RECORDING' });

    // Wait for meeting to end (max 4 hours)
    await condition(
      () => ['done', 'call_ended', 'analysis_done', 'fatal'].includes(currentStatus) || cancelled,
      '4 hours'
    );

    if (currentStatus === 'fatal') {
      await updateMeetingStatus({ meetingId, status: 'FAILED' });
      return;
    }

    // Meeting ended - process artifacts
    await updateMeetingStatus({ meetingId, status: 'PROCESSING' });

    // Download recording and transcript
    await downloadRecording({ meetingId, botId: botResult.botId });
    
    // Process transcript
    await processTranscript({ meetingId });

    // Trigger insights generation
    await triggerInsightsWorkflow({ meetingId, tenantId, userId });

    // Mark as ready
    await updateMeetingStatus({ meetingId, status: 'READY' });

  } catch (error) {
    console.error('Meeting bot workflow error:', error);
    await updateMeetingStatus({ 
      meetingId, 
      status: 'FAILED',
      error: (error as Error).message,
    });
    throw error;
  }
}
