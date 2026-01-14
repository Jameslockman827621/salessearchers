// ===========================================
// Meeting Insights Workflow
// ===========================================

import { proxyActivities, sleep } from '@temporalio/workflow';
import type * as activities from '../activities';

const {
  getTranscript,
  generateSummary,
  generateActionItems,
  generateKeyTopics,
  generateObjections,
  generateCoachingTips,
  saveInsights,
  createTasksFromActionItems,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '3 minutes',
  retry: {
    maximumAttempts: 3,
    initialInterval: '5 seconds',
    backoffCoefficient: 2,
  },
});

export interface MeetingInsightsInput {
  meetingId: string;
  tenantId: string;
  userId: string;
  regenerate?: boolean;
}

export async function meetingInsightsWorkflow(input: MeetingInsightsInput): Promise<void> {
  const { meetingId, tenantId, userId, regenerate } = input;

  // Get transcript
  const transcript = await getTranscript({ meetingId });
  
  if (!transcript || transcript.length < 50) {
    console.log('Transcript too short, skipping insights generation');
    return;
  }

  // Generate all insights in parallel
  const [summary, actionItems, keyTopics, objections, coachingTips] = await Promise.all([
    generateSummary({ transcript, meetingId }),
    generateActionItems({ transcript, meetingId }),
    generateKeyTopics({ transcript, meetingId }),
    generateObjections({ transcript, meetingId }),
    generateCoachingTips({ transcript, meetingId }),
  ]);

  // Determine sentiment from summary analysis
  const sentiment = determineSentiment(summary);

  // Save insights
  await saveInsights({
    meetingId,
    tenantId,
    summary,
    actionItems,
    keyTopics,
    objections,
    coachingTips,
    sentiment,
    regenerate: regenerate ?? false,
  });

  // Auto-create tasks from action items (if enabled)
  if (actionItems.length > 0) {
    await createTasksFromActionItems({
      meetingId,
      tenantId,
      userId,
      actionItems,
    });
  }
}

function determineSentiment(summary: string): 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'MIXED' {
  const positiveWords = ['great', 'excellent', 'successful', 'interested', 'excited', 'agreed', 'positive', 'progress'];
  const negativeWords = ['concern', 'problem', 'issue', 'objection', 'unclear', 'hesitant', 'negative', 'declined'];
  
  const lowerSummary = summary.toLowerCase();
  
  let positiveCount = 0;
  let negativeCount = 0;
  
  for (const word of positiveWords) {
    if (lowerSummary.includes(word)) positiveCount++;
  }
  
  for (const word of negativeWords) {
    if (lowerSummary.includes(word)) negativeCount++;
  }
  
  if (positiveCount > negativeCount * 2) return 'POSITIVE';
  if (negativeCount > positiveCount * 2) return 'NEGATIVE';
  if (positiveCount > 0 && negativeCount > 0) return 'MIXED';
  return 'NEUTRAL';
}
