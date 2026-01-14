/**
 * Campaign Scheduler
 * 
 * Generates LinkedInActions from campaign steps for leads that are ready
 * to proceed to the next step.
 */

import { prisma } from '@salessearchers/db';

export class CampaignScheduler {
  /**
   * Process all active campaigns and generate actions
   */
  async processCampaigns(): Promise<void> {
    console.log('[Scheduler] Processing active campaigns...');

    const activeCampaigns = await prisma.linkedInCampaign.findMany({
      where: { status: 'ACTIVE' },
      include: {
        account: true,
        steps: { orderBy: { stepNumber: 'asc' } },
      },
    });

    console.log(`[Scheduler] Found ${activeCampaigns.length} active campaigns`);

    for (const campaign of activeCampaigns) {
      await this.processCampaign(campaign);
    }
  }

  /**
   * Process a single campaign
   */
  private async processCampaign(campaign: {
    id: string;
    tenantId: string;
    accountId: string;
    dailyLimit: number;
    sendingSchedule: unknown;
    account: {
      id: string;
      userId: string;
      status: string;
    };
    steps: Array<{
      id: string;
      stepNumber: number;
      actionType: string;
      delayDays: number;
      delayHours: number;
      connectionNote: string | null;
      messageBody: string | null;
      isEnabled: boolean;
    }>;
  }): Promise<void> {
    console.log(`[Scheduler] Processing campaign ${campaign.id}`);

    // Check if account is available
    if (campaign.account.status !== 'CONNECTED') {
      console.log(`[Scheduler] Skipping campaign ${campaign.id} - account not connected`);
      return;
    }

    // Check sending schedule
    if (!this.isWithinSendingSchedule(campaign.sendingSchedule)) {
      console.log(`[Scheduler] Skipping campaign ${campaign.id} - outside sending schedule`);
      return;
    }

    // Get leads that need processing
    const leads = await this.getLeadsNeedingActions(campaign.id, campaign.dailyLimit);
    console.log(`[Scheduler] Found ${leads.length} leads needing actions in campaign ${campaign.id}`);

    for (const lead of leads) {
      await this.processLead(lead, campaign);
    }
  }

  /**
   * Get leads that are ready for their next action
   */
  private async getLeadsNeedingActions(campaignId: string, limit: number) {
    const now = new Date();

    // Get leads that:
    // 1. Are in PENDING status (ready to start)
    // 2. Or have nextActionAt <= now and are not in a terminal state
    return prisma.linkedInCampaignLead.findMany({
      where: {
        campaignId,
        OR: [
          { status: 'PENDING' },
          {
            status: { in: ['CONNECTED', 'MESSAGED', 'AWAITING_REPLY'] },
            nextActionAt: { lte: now },
          },
        ],
        // Exclude terminal states
        NOT: {
          status: { in: ['COMPLETED', 'FAILED', 'SKIPPED', 'REPLIED'] },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  /**
   * Process a single lead and create appropriate actions
   */
  private async processLead(
    lead: {
      id: string;
      campaignId: string;
      contactId: string | null;
      linkedinUrl: string;
      status: string;
      currentStep: number;
      isConnected: boolean;
      lastOutboundAt: Date | null;
      lastInboundAt: Date | null;
    },
    campaign: {
      id: string;
      tenantId: string;
      accountId: string;
      account: { id: string; userId: string };
      steps: Array<{
        stepNumber: number;
        actionType: string;
        delayDays: number;
        delayHours: number;
        connectionNote: string | null;
        messageBody: string | null;
        isEnabled: boolean;
      }>;
    }
  ): Promise<void> {
    // Check if there's already a pending action for this lead
    const existingAction = await prisma.linkedInAction.findFirst({
      where: {
        campaignLeadId: lead.id,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
    });

    if (existingAction) {
      console.log(`[Scheduler] Lead ${lead.id} already has pending action, skipping`);
      return;
    }

    // Determine what action to create based on lead status and campaign steps
    if (lead.status === 'PENDING') {
      // Start the sequence - usually profile view or connection request
      await this.createInitialAction(lead, campaign);
    } else if (lead.status === 'CONNECTED' || lead.status === 'MESSAGED') {
      // Check for replies before creating follow-up
      if (await this.hasReceivedReply(lead)) {
        console.log(`[Scheduler] Lead ${lead.id} received a reply, marking as REPLIED`);
        await prisma.linkedInCampaignLead.update({
          where: { id: lead.id },
          data: { status: 'REPLIED' },
        });
        return;
      }

      // Create next step action
      await this.createNextStepAction(lead, campaign);
    } else if (lead.status === 'AWAITING_REPLY') {
      // Check if we got a reply
      if (await this.hasReceivedReply(lead)) {
        await prisma.linkedInCampaignLead.update({
          where: { id: lead.id },
          data: { status: 'REPLIED' },
        });
        return;
      }

      // No reply - check if follow-up is due
      await this.createNextStepAction(lead, campaign);
    }
  }

  /**
   * Create the initial action for a lead
   */
  private async createInitialAction(
    lead: { id: string; contactId: string | null; linkedinUrl: string; isConnected: boolean },
    campaign: {
      tenantId: string;
      accountId: string;
      account: { userId: string };
      steps: Array<{
        stepNumber: number;
        actionType: string;
        delayDays: number;
        delayHours: number;
        connectionNote: string | null;
        messageBody: string | null;
        isEnabled: boolean;
      }>;
    }
  ): Promise<void> {
    const firstStep = campaign.steps.find(s => s.stepNumber === 1 && s.isEnabled);
    
    if (!firstStep) {
      console.log(`[Scheduler] No first step found for campaign`);
      return;
    }

    // If they're already connected, skip to messaging step
    if (lead.isConnected && firstStep.actionType === 'CONNECTION_REQUEST') {
      const messageStep = campaign.steps.find(
        s => s.isEnabled && (s.actionType === 'MESSAGE' || s.actionType === 'INMAIL')
      );
      
      if (messageStep) {
        await this.createAction(lead, campaign, messageStep);
        await prisma.linkedInCampaignLead.update({
          where: { id: lead.id },
          data: { 
            status: 'CONNECTED',
            currentStep: messageStep.stepNumber,
          },
        });
        return;
      }
    }

    // Create first step action (usually PROFILE_VIEW to check connection status)
    // If first step is CONNECTION_REQUEST, we first view the profile to check status
    if (firstStep.actionType === 'CONNECTION_REQUEST') {
      // First, view profile to check if already connected
      await prisma.linkedInAction.create({
        data: {
          tenantId: campaign.tenantId,
          userId: campaign.account.userId,
          accountId: campaign.accountId,
          campaignLeadId: lead.id,
          contactId: lead.contactId,
          actionType: 'PROFILE_VIEW',
          linkedinUrl: lead.linkedinUrl,
          scheduledAt: new Date(),
          priority: 1,
        },
      });
    }

    // Then create the actual first step
    await this.createAction(lead, campaign, firstStep);

    await prisma.linkedInCampaignLead.update({
      where: { id: lead.id },
      data: {
        status: 'CHECKING_PROFILE',
        currentStep: 1,
      },
    });
  }

  /**
   * Create the next step action for a lead
   */
  private async createNextStepAction(
    lead: { id: string; contactId: string | null; linkedinUrl: string; currentStep: number },
    campaign: {
      tenantId: string;
      accountId: string;
      account: { userId: string };
      steps: Array<{
        stepNumber: number;
        actionType: string;
        delayDays: number;
        delayHours: number;
        connectionNote: string | null;
        messageBody: string | null;
        isEnabled: boolean;
      }>;
    }
  ): Promise<void> {
    const nextStepNumber = lead.currentStep + 1;
    const nextStep = campaign.steps.find(s => s.stepNumber === nextStepNumber && s.isEnabled);

    if (!nextStep) {
      // No more steps - mark as completed
      await prisma.linkedInCampaignLead.update({
        where: { id: lead.id },
        data: { status: 'COMPLETED' },
      });
      return;
    }

    await this.createAction(lead, campaign, nextStep);

    await prisma.linkedInCampaignLead.update({
      where: { id: lead.id },
      data: { currentStep: nextStepNumber },
    });
  }

  /**
   * Create an action for a lead
   */
  private async createAction(
    lead: { id: string; contactId: string | null; linkedinUrl: string },
    campaign: {
      tenantId: string;
      accountId: string;
      account: { userId: string };
    },
    step: {
      stepNumber: number;
      actionType: string;
      delayDays: number;
      delayHours: number;
      connectionNote: string | null;
      messageBody: string | null;
    }
  ): Promise<void> {
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + step.delayDays);
    scheduledAt.setHours(scheduledAt.getHours() + step.delayHours);

    // Personalize message content
    const personalizedMessage = step.messageBody 
      ? await this.personalizeMessage(step.messageBody, lead.id)
      : null;
    const personalizedNote = step.connectionNote
      ? await this.personalizeMessage(step.connectionNote, lead.id)
      : null;

    await prisma.linkedInAction.create({
      data: {
        tenantId: campaign.tenantId,
        userId: campaign.account.userId,
        accountId: campaign.accountId,
        campaignLeadId: lead.id,
        contactId: lead.contactId,
        actionType: step.actionType as 'PROFILE_VIEW' | 'CONNECTION_REQUEST' | 'MESSAGE' | 'INMAIL' | 'CHECK_ACCEPTANCE' | 'FOLLOW' | 'LIKE' | 'COMMENT' | 'SYNC_MESSAGES',
        linkedinUrl: lead.linkedinUrl,
        connectionNote: personalizedNote,
        messageBody: personalizedMessage,
        scheduledAt,
      },
    });

    // Update lead's nextActionAt
    await prisma.linkedInCampaignLead.update({
      where: { id: lead.id },
      data: { nextActionAt: scheduledAt },
    });
  }

  /**
   * Personalize message with lead/contact data
   */
  private async personalizeMessage(template: string, leadId: string): Promise<string> {
    const lead = await prisma.linkedInCampaignLead.findUnique({
      where: { id: leadId },
      include: { contact: true },
    });

    if (!lead) return template;

    let message = template;

    // Basic personalizations
    const firstName = lead.name.split(' ')[0];
    message = message.replace(/{{firstName}}/g, firstName);
    message = message.replace(/{{name}}/g, lead.name);
    message = message.replace(/{{company}}/g, lead.company || '');
    message = message.replace(/{{headline}}/g, lead.headline || '');

    // Contact-level personalizations if available
    if (lead.contact) {
      message = message.replace(/{{title}}/g, lead.contact.title || '');
      message = message.replace(/{{email}}/g, lead.contact.email || '');
    }

    return message;
  }

  /**
   * Check if lead has received a reply
   */
  private async hasReceivedReply(lead: {
    id: string;
    lastOutboundAt: Date | null;
    lastInboundAt: Date | null;
  }): Promise<boolean> {
    // If we have lastInboundAt and it's after lastOutboundAt, they replied
    if (lead.lastInboundAt && lead.lastOutboundAt && lead.lastInboundAt > lead.lastOutboundAt) {
      return true;
    }

    // Also check the messages table for any inbound messages
    const recentInbound = await prisma.linkedInMessage.findFirst({
      where: {
        campaignLeadId: lead.id,
        isOutbound: false,
        sentAt: lead.lastOutboundAt ? { gt: lead.lastOutboundAt } : undefined,
      },
    });

    return !!recentInbound;
  }

  /**
   * Check if current time is within campaign's sending schedule
   */
  private isWithinSendingSchedule(schedule: unknown): boolean {
    if (!schedule) return true; // No schedule = always send

    const s = schedule as {
      days?: number[];
      startHour?: number;
      endHour?: number;
      timezone?: string;
    };

    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday
    const hour = now.getHours();

    // Check day of week
    if (s.days && !s.days.includes(dayOfWeek)) {
      return false;
    }

    // Check hour
    if (s.startHour !== undefined && hour < s.startHour) {
      return false;
    }
    if (s.endHour !== undefined && hour >= s.endHour) {
      return false;
    }

    return true;
  }

  /**
   * Create inbox sync actions for all connected accounts
   */
  async scheduleInboxSyncs(): Promise<void> {
    const connectedAccounts = await prisma.linkedInAccount.findMany({
      where: { status: 'CONNECTED' },
    });

    for (const account of connectedAccounts) {
      // Check if there's already a pending sync action
      const existingSync = await prisma.linkedInAction.findFirst({
        where: {
          accountId: account.id,
          actionType: 'SYNC_MESSAGES',
          status: { in: ['PENDING', 'IN_PROGRESS'] },
        },
      });

      if (existingSync) continue;

      // Create sync action (run every 30 minutes)
      await prisma.linkedInAction.create({
        data: {
          tenantId: account.tenantId,
          userId: account.userId,
          accountId: account.id,
          actionType: 'SYNC_MESSAGES',
          scheduledAt: new Date(),
          priority: -1, // Lower priority than outbound actions
        },
      });
    }
  }
}

