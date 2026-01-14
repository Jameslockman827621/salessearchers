/**
 * Action Executor
 * 
 * Processes LinkedInAction records from the database and executes them
 * using the LinkedIn browser automation.
 */

import { prisma } from '@salessearchers/db';
import { decryptJson, encryptJson } from '@salessearchers/shared';
import { LinkedInBrowser, LinkedInCredentials, LinkedInSessionData } from './linkedin-browser.js';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'dev-encryption-key-change-in-prod';
const WORKER_ID = `worker-${process.pid}-${Date.now()}`;

// Lock timeout (5 minutes) - if a worker crashes, another can pick up
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

export class ActionExecutor {
  private browser: LinkedInBrowser | null = null;
  private currentAccountId: string | null = null;

  /**
   * Process due actions for a specific account
   */
  async processAccountActions(accountId: string): Promise<void> {
    console.log(`[${WORKER_ID}] Processing actions for account ${accountId}`);

    try {
      // Try to acquire lock on the account
      const locked = await this.lockAccount(accountId);
      if (!locked) {
        console.log(`[${WORKER_ID}] Account ${accountId} is locked by another worker`);
        return;
      }

      // Get account with credentials
      const account = await prisma.linkedInAccount.findUnique({
        where: { id: accountId },
      });

      if (!account) {
        console.error(`[${WORKER_ID}] Account ${accountId} not found`);
        return;
      }

      // Check if account needs attention
      if (account.status === 'NEEDS_ATTENTION' || account.status === 'SUSPENDED') {
        console.log(`[${WORKER_ID}] Account ${accountId} status is ${account.status}, skipping`);
        return;
      }

      // Initialize browser for this account
      await this.initializeBrowser(account);

      // Get due actions for this account
      const actions = await prisma.linkedInAction.findMany({
        where: {
          accountId,
          status: 'PENDING',
          scheduledAt: { lte: new Date() },
        },
        orderBy: [
          { priority: 'desc' },
          { scheduledAt: 'asc' },
        ],
        take: 10, // Process up to 10 actions per batch
        include: {
          campaignLead: {
            include: { campaign: true },
          },
        },
      });

      console.log(`[${WORKER_ID}] Found ${actions.length} due actions for account ${accountId}`);

      for (const action of actions) {
        // Check daily limits before executing
        const limitOk = await this.checkDailyLimits(account, action.actionType);
        if (!limitOk) {
          console.log(`[${WORKER_ID}] Daily limit reached for ${action.actionType}`);
          break;
        }

        await this.executeAction(action);
        
        // Random delay between actions (3-8 seconds)
        await this.randomDelay(3000, 8000);
      }

    } catch (error) {
      console.error(`[${WORKER_ID}] Error processing account ${accountId}:`, error);
      
      // Update account status if we hit a critical error
      if (error instanceof Error && error.message.includes('CHECKPOINT')) {
        await prisma.linkedInAccount.update({
          where: { id: accountId },
          data: {
            status: 'NEEDS_ATTENTION',
            errorCode: 'CHECKPOINT',
            errorMessage: error.message,
          },
        });
      }
    } finally {
      // Release lock and close browser
      await this.cleanup(accountId);
    }
  }

  /**
   * Execute a single action
   */
  private async executeAction(action: {
    id: string;
    actionType: string;
    linkedinUrl: string | null;
    connectionNote: string | null;
    messageBody: string | null;
    campaignLeadId: string | null;
    accountId: string | null;
    campaignLead?: {
      id: string;
      linkedinUrl: string;
      campaign: {
        id: string;
        name: string;
      };
    } | null;
  }): Promise<void> {
    console.log(`[${WORKER_ID}] Executing action ${action.id} (${action.actionType})`);

    // Mark as in progress
    await prisma.linkedInAction.update({
      where: { id: action.id },
      data: {
        status: 'IN_PROGRESS',
        lockedAt: new Date(),
        lockedBy: WORKER_ID,
        attemptCount: { increment: 1 },
      },
    });

    if (!this.browser) {
      await this.markActionFailed(action.id, 'Browser not initialized', 'NO_BROWSER');
      return;
    }

    const profileUrl = action.linkedinUrl || action.campaignLead?.linkedinUrl;
    if (!profileUrl && ['PROFILE_VIEW', 'CONNECTION_REQUEST', 'CHECK_ACCEPTANCE', 'MESSAGE'].includes(action.actionType)) {
      await this.markActionFailed(action.id, 'No profile URL provided', 'NO_PROFILE_URL');
      return;
    }

    try {
      let result;

      switch (action.actionType) {
        case 'PROFILE_VIEW':
          result = await this.browser.viewProfile(profileUrl!);
          if (result.success && action.campaignLeadId) {
            // Update lead with profile data
            await this.updateLeadFromProfile(action.campaignLeadId, result.data);
          }
          break;

        case 'CONNECTION_REQUEST':
          result = await this.browser.sendConnectionRequest(profileUrl!, action.connectionNote || undefined);
          if (result.success && action.campaignLeadId) {
            // Update lead status
            const data = result.data as Record<string, unknown> | undefined;
            if (data?.alreadyConnected) {
              await this.updateLeadStatus(action.campaignLeadId, 'CONNECTED', { isConnected: true });
            } else if (data?.alreadyPending) {
              await this.updateLeadStatus(action.campaignLeadId, 'AWAITING_ACCEPT');
            } else {
              await this.updateLeadStatus(action.campaignLeadId, 'CONNECTION_SENT', { 
                connectionRequestedAt: new Date() 
              });
            }
            
            // Increment daily counter
            await this.incrementDailyCounter(action.accountId!, 'connection');
          }
          break;

        case 'CHECK_ACCEPTANCE':
          result = await this.browser.checkConnectionAccepted(profileUrl!);
          if (result.success && action.campaignLeadId) {
            const isConnected = (result as { isConnected?: boolean }).isConnected;
            if (isConnected) {
              await this.updateLeadStatus(action.campaignLeadId, 'CONNECTED', { 
                isConnected: true,
                connectedAt: new Date(),
              });
              // Schedule the first message
              await this.scheduleNextStep(action.campaignLeadId);
            } else {
              // Increment check count and reschedule
              await this.rescheduleAcceptanceCheck(action.campaignLeadId);
            }
          }
          break;

        case 'MESSAGE':
          if (!action.messageBody) {
            await this.markActionFailed(action.id, 'No message body provided', 'NO_MESSAGE_BODY');
            return;
          }
          result = await this.browser.sendMessage(profileUrl!, action.messageBody);
          if (result.success && action.campaignLeadId) {
            await this.updateLeadStatus(action.campaignLeadId, 'MESSAGED', {
              lastOutboundAt: new Date(),
            });
            // Schedule follow-up check
            await this.scheduleFollowUpCheck(action.campaignLeadId);
            
            // Increment daily counter
            await this.incrementDailyCounter(action.accountId!, 'message');
          }
          break;

        case 'SYNC_MESSAGES':
          result = await this.browser.syncMessages();
          if (result.success) {
            const messages = (result as { messages?: Array<{ threadId: string; body: string; senderName: string; sentAt: Date; isOutbound: boolean }> }).messages;
            if (messages) {
              await this.processInboxMessages(action.accountId!, messages);
            }
          }
          break;

        default:
          result = { success: false, error: `Unknown action type: ${action.actionType}` };
      }

      if (result.success) {
        await this.markActionCompleted(action.id, result.data);
      } else {
        await this.handleActionFailure(action.id, result.error || 'Unknown error', result.errorCode);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.handleActionFailure(action.id, errorMessage, 'EXECUTION_ERROR');
    }
  }

  /**
   * Initialize browser with account session
   */
  private async initializeBrowser(account: {
    id: string;
    credentials: unknown;
    sessionData: unknown;
    connectionMethod: string;
  }): Promise<void> {
    this.browser = new LinkedInBrowser(account.id, WORKER_ID);
    await this.browser.init();

    // Try to restore session if we have session data
    let sessionData: LinkedInSessionData | undefined;
    if (account.sessionData) {
      try {
        sessionData = typeof account.sessionData === 'string'
          ? decryptJson<LinkedInSessionData>(account.sessionData as string, ENCRYPTION_KEY)
          : account.sessionData as LinkedInSessionData;
      } catch {
        console.log(`[${WORKER_ID}] Failed to decrypt session data, will login fresh`);
      }
    }

    await this.browser.createContext(sessionData);

    // Check if session is valid
    const isValid = await this.browser.isSessionValid();
    
    if (!isValid) {
      console.log(`[${WORKER_ID}] Session invalid, attempting login`);
      
      // Get credentials
      if (!account.credentials) {
        throw new Error('No credentials available for login');
      }

      let credentials: LinkedInCredentials;
      try {
        credentials = typeof account.credentials === 'string'
          ? decryptJson<LinkedInCredentials>(account.credentials as string, ENCRYPTION_KEY)
          : account.credentials as LinkedInCredentials;
      } catch {
        throw new Error('Failed to decrypt credentials');
      }

      const loginResult = await this.browser.login(credentials);
      
      if (!loginResult.success) {
        // Update account status
        await prisma.linkedInAccount.update({
          where: { id: account.id },
          data: {
            status: loginResult.errorCode === 'CHECKPOINT' ? 'NEEDS_ATTENTION' : 'DISCONNECTED',
            errorCode: loginResult.errorCode,
            errorMessage: loginResult.error,
          },
        });
        throw new Error(`Login failed: ${loginResult.error}`);
      }

      // Save new session
      const newSessionData = await this.browser.exportSession();
      await prisma.linkedInAccount.update({
        where: { id: account.id },
        data: {
          sessionData: encryptJson(newSessionData, ENCRYPTION_KEY),
          status: 'CONNECTED',
          lastVerifiedAt: new Date(),
          errorCode: null,
          errorMessage: null,
        },
      });
    } else {
      // Update last verified
      await prisma.linkedInAccount.update({
        where: { id: account.id },
        data: {
          status: 'CONNECTED',
          lastVerifiedAt: new Date(),
        },
      });
    }

    this.currentAccountId = account.id;
  }

  /**
   * Lock an account for processing
   */
  private async lockAccount(accountId: string): Promise<boolean> {
    const now = new Date();
    const lockTimeout = new Date(now.getTime() - LOCK_TIMEOUT_MS);

    // Try to acquire lock (only if not locked or lock is stale)
    const result = await prisma.linkedInAccount.updateMany({
      where: {
        id: accountId,
        OR: [
          { lockedAt: null },
          { lockedAt: { lt: lockTimeout } },
        ],
      },
      data: {
        lockedAt: now,
        lockedBy: WORKER_ID,
      },
    });

    return result.count > 0;
  }

  /**
   * Release account lock and close browser
   */
  private async cleanup(accountId: string): Promise<void> {
    // Close browser
    if (this.browser) {
      // Save session before closing
      try {
        const sessionData = await this.browser.exportSession();
        await prisma.linkedInAccount.update({
          where: { id: accountId },
          data: {
            sessionData: encryptJson(sessionData, ENCRYPTION_KEY),
            lastSyncAt: new Date(),
          },
        });
      } catch {
        console.error(`[${WORKER_ID}] Failed to save session`);
      }

      await this.browser.close();
      this.browser = null;
    }

    // Release lock
    await prisma.linkedInAccount.update({
      where: { id: accountId },
      data: {
        lockedAt: null,
        lockedBy: null,
      },
    });

    this.currentAccountId = null;
  }

  /**
   * Check if daily limits allow this action
   */
  private async checkDailyLimits(
    account: {
      dailyConnectionLimit: number;
      dailyMessageLimit: number;
      dailyViewLimit: number;
      dailyConnectionsSent: number;
      dailyMessagesSent: number;
      dailyViewsDone: number;
      limitsResetAt: Date | null;
      isWarmingUp: boolean;
      warmupDay: number;
    },
    actionType: string
  ): Promise<boolean> {
    // Reset counters if it's a new day
    const now = new Date();
    if (!account.limitsResetAt || account.limitsResetAt.toDateString() !== now.toDateString()) {
      await prisma.linkedInAccount.update({
        where: { id: this.currentAccountId! },
        data: {
          dailyConnectionsSent: 0,
          dailyMessagesSent: 0,
          dailyViewsDone: 0,
          limitsResetAt: now,
          warmupDay: account.isWarmingUp ? { increment: 1 } : account.warmupDay,
        },
      });
      account.dailyConnectionsSent = 0;
      account.dailyMessagesSent = 0;
      account.dailyViewsDone = 0;
    }

    // Calculate effective limits (reduced during warmup)
    let effectiveLimits = {
      connections: account.dailyConnectionLimit,
      messages: account.dailyMessageLimit,
      views: account.dailyViewLimit,
    };

    if (account.isWarmingUp) {
      // Warmup: start at 20% and increase 10% each day
      const warmupMultiplier = Math.min(0.2 + (account.warmupDay * 0.1), 1.0);
      effectiveLimits = {
        connections: Math.floor(account.dailyConnectionLimit * warmupMultiplier),
        messages: Math.floor(account.dailyMessageLimit * warmupMultiplier),
        views: Math.floor(account.dailyViewLimit * warmupMultiplier),
      };
    }

    switch (actionType) {
      case 'CONNECTION_REQUEST':
        return account.dailyConnectionsSent < effectiveLimits.connections;
      case 'MESSAGE':
      case 'INMAIL':
        return account.dailyMessagesSent < effectiveLimits.messages;
      case 'PROFILE_VIEW':
      case 'CHECK_ACCEPTANCE':
        return account.dailyViewsDone < effectiveLimits.views;
      default:
        return true;
    }
  }

  /**
   * Increment daily action counter
   */
  private async incrementDailyCounter(accountId: string, type: 'connection' | 'message' | 'view'): Promise<void> {
    const field = type === 'connection' ? 'dailyConnectionsSent' 
                : type === 'message' ? 'dailyMessagesSent' 
                : 'dailyViewsDone';

    await prisma.linkedInAccount.update({
      where: { id: accountId },
      data: { [field]: { increment: 1 } },
    });
  }

  /**
   * Update lead from profile view data
   */
  private async updateLeadFromProfile(leadId: string, profileData: unknown): Promise<void> {
    const data = profileData as {
      linkedinId?: string;
      name?: string;
      headline?: string;
      avatarUrl?: string;
      connectionStatus?: string;
    } | undefined;

    if (!data) return;

    const connectionStatus = data.connectionStatus === 'connected' ? 'CONNECTED'
      : data.connectionStatus === 'pending_sent' ? 'PENDING_SENT'
      : data.connectionStatus === 'pending_received' ? 'PENDING_RECEIVED'
      : data.connectionStatus === 'blocked' ? 'BLOCKED'
      : 'NOT_CONNECTED';

    await prisma.linkedInCampaignLead.update({
      where: { id: leadId },
      data: {
        linkedinId: data.linkedinId,
        name: data.name,
        headline: data.headline,
        avatarUrl: data.avatarUrl,
        connectionStatus,
        isConnected: connectionStatus === 'CONNECTED',
        profileCheckedAt: new Date(),
      },
    });
  }

  /**
   * Update lead status
   */
  private async updateLeadStatus(
    leadId: string, 
    status: string,
    additionalData?: Record<string, unknown>
  ): Promise<void> {
    await prisma.linkedInCampaignLead.update({
      where: { id: leadId },
      data: {
        status: status as 'PENDING' | 'CHECKING_PROFILE' | 'CONNECTION_SENT' | 'AWAITING_ACCEPT' | 'CONNECTED' | 'MESSAGED' | 'AWAITING_REPLY' | 'REPLIED' | 'COMPLETED' | 'FAILED' | 'SKIPPED',
        lastActionAt: new Date(),
        ...additionalData,
      },
    });
  }

  /**
   * Schedule the next step for a lead
   */
  private async scheduleNextStep(leadId: string): Promise<void> {
    const lead = await prisma.linkedInCampaignLead.findUnique({
      where: { id: leadId },
      include: {
        campaign: {
          include: {
            account: true,
            steps: { orderBy: { stepNumber: 'asc' } },
          },
        },
      },
    });

    if (!lead || !lead.campaign) return;

    const nextStepNumber = lead.currentStep + 1;
    const nextStep = lead.campaign.steps.find(s => s.stepNumber === nextStepNumber);

    if (!nextStep) {
      // No more steps, mark as completed
      await prisma.linkedInCampaignLead.update({
        where: { id: leadId },
        data: { status: 'COMPLETED' },
      });
      return;
    }

    // Calculate scheduled time based on delay
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + nextStep.delayDays);
    scheduledAt.setHours(scheduledAt.getHours() + nextStep.delayHours);

    // Create the action
    await prisma.linkedInAction.create({
      data: {
        tenantId: lead.campaign.tenantId,
        userId: lead.campaign.account.userId,
        accountId: lead.campaign.accountId,
        campaignLeadId: leadId,
        contactId: lead.contactId,
        actionType: nextStep.actionType,
        linkedinUrl: lead.linkedinUrl,
        connectionNote: nextStep.connectionNote,
        messageBody: nextStep.messageBody,
        scheduledAt,
      },
    });

    // Update lead
    await prisma.linkedInCampaignLead.update({
      where: { id: leadId },
      data: {
        currentStep: nextStepNumber,
        nextActionAt: scheduledAt,
      },
    });
  }

  /**
   * Reschedule acceptance check with backoff
   */
  private async rescheduleAcceptanceCheck(leadId: string): Promise<void> {
    const lead = await prisma.linkedInCampaignLead.findUnique({
      where: { id: leadId },
      include: { campaign: { include: { account: true } } },
    });

    if (!lead || !lead.campaign) return;

    // Backoff: check every 4 hours initially, then every 12 hours, then daily
    const checkCount = lead.acceptanceCheckCount;
    let hoursUntilNextCheck = 4;
    if (checkCount >= 3) hoursUntilNextCheck = 12;
    if (checkCount >= 6) hoursUntilNextCheck = 24;
    
    // Give up after 14 days (approximately 21 checks)
    if (checkCount >= 21) {
      await prisma.linkedInCampaignLead.update({
        where: { id: leadId },
        data: { 
          status: 'FAILED',
          errorMessage: 'Connection request not accepted after 14 days',
        },
      });
      return;
    }

    const scheduledAt = new Date();
    scheduledAt.setHours(scheduledAt.getHours() + hoursUntilNextCheck);

    await prisma.linkedInAction.create({
      data: {
        tenantId: lead.campaign.tenantId,
        userId: lead.campaign.account.userId,
        accountId: lead.campaign.accountId,
        campaignLeadId: leadId,
        contactId: lead.contactId,
        actionType: 'CHECK_ACCEPTANCE',
        linkedinUrl: lead.linkedinUrl,
        scheduledAt,
      },
    });

    await prisma.linkedInCampaignLead.update({
      where: { id: leadId },
      data: {
        acceptanceCheckCount: { increment: 1 },
        nextActionAt: scheduledAt,
        status: 'AWAITING_ACCEPT',
      },
    });
  }

  /**
   * Schedule a follow-up reply check
   */
  private async scheduleFollowUpCheck(leadId: string): Promise<void> {
    const lead = await prisma.linkedInCampaignLead.findUnique({
      where: { id: leadId },
      include: { campaign: { include: { account: true, steps: { orderBy: { stepNumber: 'asc' } } } } },
    });

    if (!lead || !lead.campaign) return;

    // Find the next step (follow-up message)
    const nextStepNumber = lead.currentStep + 1;
    const nextStep = lead.campaign.steps.find(s => s.stepNumber === nextStepNumber);

    if (!nextStep) {
      // No follow-up configured, just wait for reply
      await prisma.linkedInCampaignLead.update({
        where: { id: leadId },
        data: { status: 'AWAITING_REPLY' },
      });
      return;
    }

    // Schedule follow-up after delay (the scheduler will check for replies before sending)
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + nextStep.delayDays);
    scheduledAt.setHours(scheduledAt.getHours() + nextStep.delayHours);

    await prisma.linkedInAction.create({
      data: {
        tenantId: lead.campaign.tenantId,
        userId: lead.campaign.account.userId,
        accountId: lead.campaign.accountId,
        campaignLeadId: leadId,
        contactId: lead.contactId,
        actionType: nextStep.actionType,
        linkedinUrl: lead.linkedinUrl,
        messageBody: nextStep.messageBody,
        scheduledAt,
      },
    });

    await prisma.linkedInCampaignLead.update({
      where: { id: leadId },
      data: {
        currentStep: nextStepNumber,
        nextActionAt: scheduledAt,
        status: 'AWAITING_REPLY',
      },
    });
  }

  /**
   * Process synced inbox messages
   */
  private async processInboxMessages(
    accountId: string, 
    messages: Array<{ 
      threadId: string; 
      messageId?: string;
      body: string; 
      senderName: string; 
      senderUrl?: string;
      sentAt: Date; 
      isOutbound: boolean;
    }>
  ): Promise<void> {
    const account = await prisma.linkedInAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) return;

    for (const msg of messages) {
      // Check if message already exists
      const existing = await prisma.linkedInMessage.findFirst({
        where: {
          accountId,
          threadId: msg.threadId,
          sentAt: msg.sentAt,
          body: msg.body,
        },
      });

      if (existing) continue;

      // Try to find the campaign lead this message is from/to
      let campaignLeadId: string | undefined;
      if (msg.senderUrl && !msg.isOutbound) {
        const lead = await prisma.linkedInCampaignLead.findFirst({
          where: {
            linkedinUrl: { contains: msg.senderUrl },
            campaign: { accountId },
          },
        });
        if (lead) {
          campaignLeadId = lead.id;
          
          // Update lead status if this is a reply
          if (lead.status === 'AWAITING_REPLY' || lead.status === 'MESSAGED') {
            await prisma.linkedInCampaignLead.update({
              where: { id: lead.id },
              data: {
                status: 'REPLIED',
                lastInboundAt: msg.sentAt,
                threadId: msg.threadId,
              },
            });

            // Update campaign stats
            await prisma.linkedInCampaign.update({
              where: { id: lead.campaignId },
              data: { repliedCount: { increment: 1 } },
            });

            // Cancel pending follow-up actions for this lead
            await prisma.linkedInAction.updateMany({
              where: {
                campaignLeadId: lead.id,
                status: 'PENDING',
                actionType: 'MESSAGE',
              },
              data: { status: 'CANCELLED' },
            });
          }
        }
      }

      // Save the message
      await prisma.linkedInMessage.create({
        data: {
          tenantId: account.tenantId,
          accountId,
          threadId: msg.threadId,
          messageId: msg.messageId,
          body: msg.body,
          senderName: msg.senderName,
          senderUrl: msg.senderUrl,
          sentAt: msg.sentAt,
          isOutbound: msg.isOutbound,
          campaignLeadId,
        },
      });
    }
  }

  /**
   * Mark action as completed
   */
  private async markActionCompleted(actionId: string, resultData?: unknown): Promise<void> {
    await prisma.linkedInAction.update({
      where: { id: actionId },
      data: {
        status: 'COMPLETED',
        executedAt: new Date(),
        resultData: resultData ? JSON.parse(JSON.stringify(resultData)) : undefined,
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  /**
   * Mark action as failed
   */
  private async markActionFailed(actionId: string, error: string, errorCode?: string): Promise<void> {
    await prisma.linkedInAction.update({
      where: { id: actionId },
      data: {
        status: 'FAILED',
        executedAt: new Date(),
        errorMessage: error,
        errorCode,
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  /**
   * Handle action failure with retry logic
   */
  private async handleActionFailure(actionId: string, error: string, errorCode?: string): Promise<void> {
    const action = await prisma.linkedInAction.findUnique({
      where: { id: actionId },
    });

    if (!action) return;

    // Check if we should retry
    if (action.attemptCount < action.maxAttempts && !['CHECKPOINT', 'INVALID_CREDENTIALS', 'SUSPENDED'].includes(errorCode || '')) {
      // Calculate backoff (exponential: 5min, 15min, 45min)
      const backoffMinutes = Math.pow(3, action.attemptCount) * 5;
      const nextRetryAt = new Date();
      nextRetryAt.setMinutes(nextRetryAt.getMinutes() + backoffMinutes);

      await prisma.linkedInAction.update({
        where: { id: actionId },
        data: {
          status: 'PENDING',
          nextRetryAt,
          scheduledAt: nextRetryAt,
          errorMessage: error,
          errorCode,
          lockedAt: null,
          lockedBy: null,
        },
      });
    } else {
      // Max retries reached or non-retryable error
      await this.markActionFailed(actionId, error, errorCode);

      // Update lead status if applicable
      if (action.campaignLeadId) {
        await prisma.linkedInCampaignLead.update({
          where: { id: action.campaignLeadId },
          data: {
            errorMessage: error,
            errorCount: { increment: 1 },
          },
        });
      }
    }
  }

  /**
   * Random delay helper
   */
  private async randomDelay(minMs: number, maxMs: number): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

