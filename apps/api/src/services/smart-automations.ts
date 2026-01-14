// ===========================================
// Smart Automations Service
// Invisible automations that make the SaaS feel magical
// ===========================================

import { prisma } from '@salessearchers/db';
import { logger } from '@salessearchers/shared';

// ===========================================
// Auto-Pause Sequence on Reply
// When a contact replies to an email, pause their active sequence
// ===========================================

export async function autoPauseOnReply(params: {
  tenantId: string;
  contactId: string;
  contactEmail: string;
  channel: 'EMAIL' | 'LINKEDIN';
  messagePreview?: string;
}): Promise<{ paused: boolean; sequenceIds: string[] }> {
  const { tenantId, contactId, channel, messagePreview } = params;

  try {
    // Find active sequence enrollments for this contact
    const activeEnrollments = await prisma.sequenceEnrollment.findMany({
      where: {
        tenantId,
        contactId,
        status: 'ACTIVE',
      },
      include: {
        sequence: {
          select: { id: true, name: true },
        },
      },
    });

    if (activeEnrollments.length === 0) {
      return { paused: false, sequenceIds: [] };
    }

    const pausedSequenceIds: string[] = [];

    for (const enrollment of activeEnrollments) {
      // Pause the enrollment
      await prisma.sequenceEnrollment.update({
        where: { id: enrollment.id },
        data: {
          status: 'PAUSED',
          pauseReason: `Auto-paused: Contact replied via ${channel}`,
        },
      });

      pausedSequenceIds.push(enrollment.sequence.id);

      // Create activity log
      await prisma.activity.create({
        data: {
          tenantId,
          contactId,
          type: 'sequence_auto_paused',
          title: `Sequence "${enrollment.sequence.name}" auto-paused`,
          description: `Automatically paused because contact replied via ${channel}${messagePreview ? `: "${messagePreview.slice(0, 100)}..."` : ''}`,
        },
      });

      logger.info('Auto-paused sequence on reply', {
        tenantId,
        contactId,
        sequenceId: enrollment.sequence.id,
        channel,
      });
    }

    // Also pause LinkedIn campaigns if reply was via LinkedIn
    if (channel === 'LINKEDIN') {
      const activeCampaignLeads = await prisma.linkedInCampaignLead.findMany({
        where: {
          tenantId,
          contactId,
          status: { in: ['PENDING', 'CONNECTION_SENT', 'CONNECTED', 'MESSAGED'] },
        },
      });

      for (const lead of activeCampaignLeads) {
        await prisma.linkedInCampaignLead.update({
          where: { id: lead.id },
          data: {
            status: 'REPLIED',
            lastInboundAt: new Date(),
          },
        });
      }
    }

    // Update contact's lastRepliedAt
    await prisma.contact.update({
      where: { id: contactId },
      data: { lastRepliedAt: new Date() },
    });

    return { paused: true, sequenceIds: pausedSequenceIds };
  } catch (error) {
    logger.error('Failed to auto-pause sequence on reply', { error });
    return { paused: false, sequenceIds: [] };
  }
}

// ===========================================
// Hot Signal Detection - Data Room View
// When someone views a data room, create a hot signal notification
// ===========================================

export async function triggerDataRoomHotSignal(params: {
  tenantId: string;
  dataRoomId: string;
  viewerId: string | null;
  contactId: string | null;
  duration: number;
  pagesViewed: number;
}): Promise<void> {
  const { tenantId, dataRoomId, contactId, duration, pagesViewed } = params;

  try {
    const dataRoom = await prisma.dataRoom.findUnique({
      where: { id: dataRoomId },
      include: {
        contact: { include: { company: true } },
      },
    });

    if (!dataRoom) return;

    const contact = contactId
      ? await prisma.contact.findUnique({
          where: { id: contactId },
          include: { company: true },
        })
      : dataRoom.contact;

    // Determine signal strength based on engagement
    const isHighEngagement = duration > 120 || pagesViewed > 3; // 2+ minutes or 3+ pages
    const signalStrength = isHighEngagement ? 'HOT' : 'WARM';

    // Create notification for the data room owner
    const ownerId = dataRoom.createdById;

    if (ownerId) {
      await prisma.notification.create({
        data: {
          tenantId,
          userId: ownerId,
          type: 'system',
          title: `${signalStrength} Signal: Data room "${dataRoom.name}" viewed`,
          body: contact
            ? `${[contact.firstName, contact.lastName].filter(Boolean).join(' ')} from ${contact.company?.name || 'Unknown company'} spent ${Math.round(duration / 60)} minutes viewing ${pagesViewed} page(s).`
            : `Anonymous viewer spent ${Math.round(duration / 60)} minutes viewing ${pagesViewed} page(s).`,
          priority: isHighEngagement ? 'high' : 'medium',
        },
      });
    }

    // Create activity log
    await prisma.activity.create({
      data: {
        tenantId,
        contactId: contact?.id,
        type: 'data_room_viewed',
        title: `Data room "${dataRoom.name}" viewed`,
        description: `${duration > 0 ? `${Math.round(duration / 60)} minutes` : 'Quick view'}, ${pagesViewed} page(s)`,
      },
    });

    // If high engagement, create a suggested follow-up task
    if (isHighEngagement && contact && ownerId) {
      const existingTask = await prisma.task.findFirst({
        where: {
          tenantId,
          contactId: contact.id,
          status: { not: 'COMPLETED' },
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
        },
      });

      if (!existingTask) {
        await prisma.task.create({
          data: {
            tenantId,
            assigneeId: ownerId,
            contactId: contact.id,
            title: `Follow up: ${[contact.firstName, contact.lastName].filter(Boolean).join(' ')} viewed data room`,
            description: `${[contact.firstName, contact.lastName].filter(Boolean).join(' ')} spent ${Math.round(duration / 60)} minutes viewing "${dataRoom.name}". This is a hot signal - they're engaged!`,
            status: 'PENDING',
            priority: 'HIGH',
            dueAt: new Date(Date.now() + 4 * 60 * 60 * 1000), // Due in 4 hours
          },
        });
      }
    }

    // Update lead score if contact exists
    if (contact) {
      const scoreIncrease = isHighEngagement ? 20 : 10;
      await updateLeadScore(tenantId, contact.id, scoreIncrease, 'Data room engagement');
    }

    logger.info('Triggered data room hot signal', {
      tenantId,
      dataRoomId,
      contactId: contact?.id,
      signalStrength,
    });
  } catch (error) {
    logger.error('Failed to trigger data room hot signal', { error });
  }
}

// ===========================================
// Send Follow-Up Email from Call Wrap-Up
// ===========================================

export async function sendCallWrapUpEmail(params: {
  tenantId: string;
  userId: string;
  meetingId: string;
  contactId: string;
  emailSubject: string;
  emailBody: string;
  connectionId?: string;
}): Promise<{ sent: boolean; messageId?: string; error?: string }> {
  const { tenantId, userId, meetingId, contactId, emailSubject, emailBody } = params;

  try {
    // Get contact
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, tenantId },
    });

    if (!contact?.email) {
      return { sent: false, error: 'Contact has no email address' };
    }

    // Create activity for email draft
    await prisma.activity.create({
      data: {
        tenantId,
        userId,
        contactId,
        type: 'email_draft_created',
        title: `Follow-up email drafted`,
        description: `Subject: "${emailSubject}"`,
      },
    });

    // Update contact's lastContactedAt
    await prisma.contact.update({
      where: { id: contactId },
      data: { lastContactedAt: new Date() },
    });

    logger.info('Created call wrap-up follow-up email draft', {
      tenantId,
      meetingId,
      contactId,
    });

    return { sent: true };
  } catch (error) {
    logger.error('Failed to create call wrap-up email', { error });
    return { sent: false, error: 'Failed to create email' };
  }
}

// ===========================================
// Update Lead Score
// ===========================================

export async function updateLeadScore(
  tenantId: string,
  contactId: string,
  scoreChange: number,
  reason: string
): Promise<void> {
  try {
    const existingScore = await prisma.leadScore.findUnique({
      where: { contactId },
    });

    if (existingScore) {
      const newScore = Math.min(100, Math.max(0, existingScore.totalScore + scoreChange));
      const newGrade = calculateGrade(newScore);

      await prisma.leadScore.update({
        where: { contactId },
        data: {
          totalScore: newScore,
          grade: newGrade,
          engagementScore: Math.min(100, existingScore.engagementScore + Math.abs(scoreChange)),
          scoreHistory: {
            push: {
              timestamp: new Date().toISOString(),
              change: scoreChange,
              reason,
              newScore,
            },
          },
        },
      });
    } else {
      const initialScore = Math.min(100, Math.max(0, 50 + scoreChange));
      await prisma.leadScore.create({
        data: {
          tenantId,
          contactId,
          totalScore: initialScore,
          grade: calculateGrade(initialScore),
          engagementScore: Math.abs(scoreChange),
          fitScore: 50,
          scoreHistory: [
            {
              timestamp: new Date().toISOString(),
              change: scoreChange,
              reason,
              newScore: initialScore,
            },
          ],
        },
      });
    }
  } catch (error) {
    logger.error('Failed to update lead score', { error });
  }
}

function calculateGrade(score: number): string {
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  if (score >= 20) return 'D';
  return 'F';
}

// ===========================================
// Process Inbound Email (called during email sync)
// ===========================================

export async function processInboundEmail(params: {
  tenantId: string;
  threadId: string;
  contactId: string | null;
  contactEmail: string;
  subject: string;
  bodyPreview: string;
}): Promise<void> {
  const { tenantId, contactId, contactEmail, bodyPreview } = params;

  if (contactId) {
    // Auto-pause sequences
    await autoPauseOnReply({
      tenantId,
      contactId,
      contactEmail,
      channel: 'EMAIL',
      messagePreview: bodyPreview,
    });

    // Update lead score
    await updateLeadScore(tenantId, contactId, 15, 'Replied to email');
  }
}

// ===========================================
// Process Inbound LinkedIn Message
// ===========================================

export async function processInboundLinkedInMessage(params: {
  tenantId: string;
  accountId: string;
  contactId: string | null;
  senderName: string;
  senderUrl: string;
  messageBody: string;
}): Promise<void> {
  const { tenantId, contactId, senderUrl, messageBody } = params;

  if (contactId) {
    // Auto-pause sequences
    await autoPauseOnReply({
      tenantId,
      contactId,
      contactEmail: senderUrl,
      channel: 'LINKEDIN',
      messagePreview: messageBody,
    });

    // Update lead score
    await updateLeadScore(tenantId, contactId, 20, 'Replied on LinkedIn');
  }
}
