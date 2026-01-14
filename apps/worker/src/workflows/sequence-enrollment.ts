import { proxyActivities, sleep, continueAsNew } from '@temporalio/workflow';
import type * as activities from '../activities';

const {
  getEnrollmentDetails,
  getSequenceStep,
  sendSequenceEmail,
  updateEnrollmentProgress,
  recordSequenceEvent,
  checkForReply,
  completeEnrollment,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
  retry: {
    maximumAttempts: 5,
    backoffCoefficient: 2,
    initialInterval: '30s',
  },
});

export interface SequenceEnrollmentInput {
  enrollmentId: string;
}

/**
 * Workflow that manages a contact's journey through an email sequence
 * Handles delays between steps, sends emails, and responds to events
 */
export async function sequenceEnrollmentWorkflow(input: SequenceEnrollmentInput): Promise<void> {
  const { enrollmentId } = input;

  // Get enrollment details
  const enrollment = await getEnrollmentDetails({ enrollmentId });
  if (!enrollment) {
    return;
  }

  // If not active, exit
  if (enrollment.status !== 'ACTIVE') {
    return;
  }

  // Get current step
  const currentStepNumber = enrollment.currentStepNumber;
  const step = await getSequenceStep({
    sequenceId: enrollment.id, // This is actually from the enrollment's related sequence
    stepNumber: currentStepNumber,
  });

  if (!step) {
    // No more steps, complete the enrollment
    await completeEnrollment({ enrollmentId, status: 'COMPLETED' });
    await recordSequenceEvent({
      enrollmentId,
      eventType: 'COMPLETED',
    });
    return;
  }

  // Skip disabled steps
  if (!step.isEnabled) {
    await updateEnrollmentProgress({
      enrollmentId,
      currentStepNumber: currentStepNumber + 1,
      nextScheduledAt: new Date(),
    });
    // Continue with next step
    await continueAsNew<typeof sequenceEnrollmentWorkflow>({ enrollmentId });
    return;
  }

  // Calculate delay for this step
  const delayMs = (step.delayDays * 24 * 60 * 60 * 1000) + (step.delayHours * 60 * 60 * 1000);

  if (delayMs > 0 && currentStepNumber > 1) {
    // Record that we're waiting
    await recordSequenceEvent({
      enrollmentId,
      eventType: 'STEP_WAITING',
      stepNumber: currentStepNumber,
      details: { delayMs },
    });

    // Wait for the delay
    await sleep(delayMs);

    // Check if still active after waiting
    const stillActive = await getEnrollmentDetails({ enrollmentId });
    if (!stillActive || stillActive.status !== 'ACTIVE') {
      return;
    }

    // Check if contact replied while waiting
    const replied = await checkForReply({ enrollmentId });
    if (replied) {
      return; // Workflow will be stopped by reply detection
    }
  }

  // Execute the step based on type
  switch (step.stepType) {
    case 'EMAIL':
      try {
        await sendSequenceEmail({
          enrollmentId,
          stepId: step.id,
          stepNumber: currentStepNumber,
        });

        await recordSequenceEvent({
          enrollmentId,
          eventType: 'STEP_SENT',
          stepNumber: currentStepNumber,
        });
      } catch (error) {
        // Handle send failure
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Check if bounce
        if (errorMessage.includes('bounce') || errorMessage.includes('invalid')) {
          await completeEnrollment({ enrollmentId, status: 'BOUNCED' });
          await recordSequenceEvent({
            enrollmentId,
            eventType: 'BOUNCED',
            stepNumber: currentStepNumber,
            details: { error: errorMessage },
          });
          return;
        }

        // Rethrow for retry
        throw error;
      }
      break;

    case 'WAIT':
      // Just record the wait step
      await recordSequenceEvent({
        enrollmentId,
        eventType: 'STEP_WAIT',
        stepNumber: currentStepNumber,
      });
      break;

    case 'TASK':
      // Create a task for manual action
      await recordSequenceEvent({
        enrollmentId,
        eventType: 'TASK_CREATED',
        stepNumber: currentStepNumber,
        details: { subject: step.subject },
      });
      break;

    case 'LINKEDIN_VIEW':
    case 'LINKEDIN_CONNECT':
    case 'LINKEDIN_MESSAGE':
      // LinkedIn steps are manual - create a task
      await recordSequenceEvent({
        enrollmentId,
        eventType: 'LINKEDIN_TASK',
        stepNumber: currentStepNumber,
        details: { stepType: step.stepType, subject: step.subject },
      });
      break;
  }

  // Move to next step
  const nextStepNumber = currentStepNumber + 1;

  if (nextStepNumber > enrollment.totalSteps) {
    // Completed all steps
    await completeEnrollment({ enrollmentId, status: 'COMPLETED' });
    await recordSequenceEvent({
      enrollmentId,
      eventType: 'COMPLETED',
    });
  } else {
    // Update progress and continue
    await updateEnrollmentProgress({
      enrollmentId,
      currentStepNumber: nextStepNumber,
      nextScheduledAt: new Date(Date.now() + 1000), // Small buffer
    });

    // Continue with next step
    await continueAsNew<typeof sequenceEnrollmentWorkflow>({ enrollmentId });
  }
}
