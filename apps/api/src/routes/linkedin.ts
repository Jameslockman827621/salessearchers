import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@salessearchers/db';
import { encrypt, encryptJson } from '@salessearchers/shared';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'dev-encryption-key-change-in-prod';

// Schemas
const connectAccountSchema = z.object({
  profileUrl: z.string().url(),
  name: z.string(),
  email: z.string().email().optional(),
  headline: z.string().optional(),
  avatarUrl: z.string().optional(),
  sessionCookie: z.string().optional(),
  csrfToken: z.string().optional(),
  connectionMethod: z.enum(['COOKIE', 'CREDENTIALS', 'EXTENSION', 'INFINITE_LOGIN']).default('COOKIE'),
  linkedinPassword: z.string().optional(),
  twoFASecret: z.string().optional(),
  country: z.string().optional(),
});

const createCampaignSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  accountId: z.string().uuid(),
  dailyLimit: z.number().min(1).max(100).default(20),
  sendingSchedule: z.object({
    days: z.array(z.number().min(0).max(6)),
    startHour: z.number().min(0).max(23),
    endHour: z.number().min(0).max(23),
    timezone: z.string(),
  }).optional(),
  steps: z.array(z.object({
    stepNumber: z.number(),
    actionType: z.enum(['PROFILE_VIEW', 'CONNECTION_REQUEST', 'MESSAGE', 'INMAIL', 'FOLLOW', 'LIKE', 'COMMENT']),
    delayDays: z.number().default(0),
    delayHours: z.number().default(0),
    connectionNote: z.string().optional(),
    messageSubject: z.string().optional(),
    messageBody: z.string().optional(),
  })),
});

const addLeadsSchema = z.object({
  campaignId: z.string().uuid(),
  leads: z.array(z.object({
    linkedinUrl: z.string().url(),
    name: z.string(),
    headline: z.string().optional(),
    company: z.string().optional(),
    avatarUrl: z.string().optional(),
    contactId: z.string().uuid().optional(),
  })),
});

const importFromContactsSchema = z.object({
  campaignId: z.string().uuid(),
  contactIds: z.array(z.string().uuid()),
});

export async function linkedInRoutes(fastify: FastifyInstance) {
  // Get all LinkedIn accounts
  fastify.get('/accounts', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const tenantId = request.tenantId!;

    const accounts = await prisma.linkedInAccount.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            campaigns: true,
            actions: true,
          },
        },
      },
    });

    return { success: true, data: accounts };
  });

  // Get single LinkedIn account
  fastify.get('/accounts/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.tenantId!;

    const account = await prisma.linkedInAccount.findFirst({
      where: { id, tenantId },
      include: {
        campaigns: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        _count: {
          select: {
            campaigns: true,
            actions: true,
            messages: true,
          },
        },
      },
    });

    if (!account) {
      return reply.code(404).send({ success: false, error: 'Account not found' });
    }

    return { success: true, data: account };
  });

  // Connect LinkedIn account
  fastify.post('/accounts', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const data = connectAccountSchema.parse(request.body);
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    // Determine status based on connection method
    // INFINITE_LOGIN and CREDENTIALS get credentials stored for worker verification
    const hasCredentials = data.linkedinPassword && (
      data.connectionMethod === 'INFINITE_LOGIN' || 
      data.connectionMethod === 'CREDENTIALS'
    );
    
    // Set initial status - VERIFYING means worker will attempt login
    let status: 'CONNECTED' | 'DISCONNECTED' | 'VERIFYING' = 'DISCONNECTED';
    if (data.sessionCookie) {
      status = 'CONNECTED';
    } else if (hasCredentials) {
      status = 'VERIFYING'; // Worker will attempt login
    }

    // Encrypt credentials securely
    let encryptedCredentials: string | undefined;
    if (hasCredentials) {
      encryptedCredentials = encryptJson({
        email: data.email,
        password: data.linkedinPassword,
        twoFASecret: data.twoFASecret,
        country: data.country,
      }, ENCRYPTION_KEY);
    }

    // Check if account already exists
    const existing = await prisma.linkedInAccount.findFirst({
      where: { tenantId, profileUrl: data.profileUrl },
    });

    if (existing) {
      // Update existing account
      const updated = await prisma.linkedInAccount.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          email: data.email,
          headline: data.headline,
          avatarUrl: data.avatarUrl,
          sessionCookie: data.sessionCookie,
          csrfToken: data.csrfToken,
          connectionMethod: data.connectionMethod,
          credentials: encryptedCredentials || existing.credentials,
          status,
          lastSyncAt: new Date(),
          errorCode: null,
          errorMessage: null,
        },
      });
      return { success: true, data: sanitizeAccount(updated) };
    }

    // Create new account
    const account = await prisma.linkedInAccount.create({
      data: {
        tenantId,
        userId,
        profileUrl: data.profileUrl,
        name: data.name,
        email: data.email,
        headline: data.headline,
        avatarUrl: data.avatarUrl,
        sessionCookie: data.sessionCookie,
        csrfToken: data.csrfToken,
        connectionMethod: data.connectionMethod,
        credentials: encryptedCredentials,
        status,
        // Enable warmup for new accounts
        isWarmingUp: true,
        warmupStartedAt: new Date(),
      },
    });

    return { success: true, data: sanitizeAccount(account) };
  });

  // Helper to remove sensitive data from account
  function sanitizeAccount(account: Record<string, unknown>) {
    const { credentials, sessionCookie, csrfToken, sessionData, ...safe } = account;
    return {
      ...safe,
      hasCredentials: !!credentials,
      hasSession: !!sessionCookie || !!sessionData,
    };
  }

  // Disconnect LinkedIn account
  fastify.delete('/accounts/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.tenantId!;

    const account = await prisma.linkedInAccount.findFirst({
      where: { id, tenantId },
    });

    if (!account) {
      return reply.code(404).send({ success: false, error: 'Account not found' });
    }

    await prisma.linkedInAccount.delete({
      where: { id },
    });

    return { success: true };
  });

  // Update account status
  fastify.patch('/accounts/:id/status', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status, sessionCookie, csrfToken } = z.object({
      status: z.enum(['CONNECTED', 'DISCONNECTED', 'RECONNECTING', 'RATE_LIMITED', 'SUSPENDED']).optional(),
      sessionCookie: z.string().optional(),
      csrfToken: z.string().optional(),
    }).parse(request.body);
    const tenantId = request.tenantId!;

    const account = await prisma.linkedInAccount.findFirst({
      where: { id, tenantId },
    });

    if (!account) {
      return reply.code(404).send({ success: false, error: 'Account not found' });
    }

    const updated = await prisma.linkedInAccount.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(sessionCookie && { sessionCookie }),
        ...(csrfToken && { csrfToken }),
        lastSyncAt: new Date(),
      },
    });

    return { success: true, data: updated };
  });

  // Get all campaigns
  fastify.get('/campaigns', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const tenantId = request.tenantId!;
    const { accountId, status } = request.query as { accountId?: string; status?: string };

    const campaigns = await prisma.linkedInCampaign.findMany({
      where: {
        tenantId,
        ...(accountId && { accountId }),
        ...(status && { status: status as 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED' }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        account: {
          select: { id: true, name: true, avatarUrl: true, status: true },
        },
        steps: {
          orderBy: { stepNumber: 'asc' },
        },
        _count: {
          select: { leads: true },
        },
      },
    });

    return { success: true, data: campaigns };
  });

  // Get single campaign
  fastify.get('/campaigns/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.tenantId!;

    const campaign = await prisma.linkedInCampaign.findFirst({
      where: { id, tenantId },
      include: {
        account: true,
        steps: {
          orderBy: { stepNumber: 'asc' },
        },
        leads: {
          orderBy: { createdAt: 'desc' },
          take: 100,
          include: {
            contact: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
        _count: {
          select: { leads: true },
        },
      },
    });

    if (!campaign) {
      return reply.code(404).send({ success: false, error: 'Campaign not found' });
    }

    return { success: true, data: campaign };
  });

  // Create campaign
  fastify.post('/campaigns', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const data = createCampaignSchema.parse(request.body);
    const tenantId = request.tenantId!;

    const campaign = await prisma.linkedInCampaign.create({
      data: {
        tenantId,
        accountId: data.accountId,
        name: data.name,
        description: data.description,
        dailyLimit: data.dailyLimit,
        sendingSchedule: data.sendingSchedule,
        steps: {
          create: data.steps.map(step => ({
            stepNumber: step.stepNumber,
            actionType: step.actionType,
            delayDays: step.delayDays,
            delayHours: step.delayHours,
            connectionNote: step.connectionNote,
            messageSubject: step.messageSubject,
            messageBody: step.messageBody,
          })),
        },
      },
      include: {
        steps: true,
        account: true,
      },
    });

    return { success: true, data: campaign };
  });

  // Update campaign
  fastify.patch('/campaigns/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED']).optional(),
      dailyLimit: z.number().optional(),
    }).parse(request.body);
    const tenantId = request.tenantId!;

    const campaign = await prisma.linkedInCampaign.findFirst({
      where: { id, tenantId },
    });

    if (!campaign) {
      return reply.code(404).send({ success: false, error: 'Campaign not found' });
    }

    const updated = await prisma.linkedInCampaign.update({
      where: { id },
      data,
      include: {
        steps: true,
        account: true,
      },
    });

    return { success: true, data: updated };
  });

  // Delete campaign
  fastify.delete('/campaigns/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.tenantId!;

    const campaign = await prisma.linkedInCampaign.findFirst({
      where: { id, tenantId },
    });

    if (!campaign) {
      return reply.code(404).send({ success: false, error: 'Campaign not found' });
    }

    await prisma.linkedInCampaign.delete({
      where: { id },
    });

    return { success: true };
  });

  // Add leads to campaign
  fastify.post('/campaigns/:id/leads', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = addLeadsSchema.parse(request.body);
    const tenantId = request.tenantId!;

    if (id !== data.campaignId) {
      return reply.code(400).send({ success: false, error: 'Campaign ID mismatch' });
    }

    const campaign = await prisma.linkedInCampaign.findFirst({
      where: { id, tenantId },
    });

    if (!campaign) {
      return reply.code(404).send({ success: false, error: 'Campaign not found' });
    }

    // Create leads
    const results = await Promise.allSettled(
      data.leads.map(lead =>
        prisma.linkedInCampaignLead.create({
          data: {
            campaignId: id,
            linkedinUrl: lead.linkedinUrl,
            name: lead.name,
            headline: lead.headline,
            company: lead.company,
            avatarUrl: lead.avatarUrl,
            contactId: lead.contactId,
          },
        })
      )
    );

    const created = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    // Update campaign lead count
    await prisma.linkedInCampaign.update({
      where: { id },
      data: {
        totalLeads: { increment: created },
      },
    });

    return {
      success: true,
      data: {
        created,
        failed,
        total: data.leads.length,
      },
    };
  });

  // Import leads from contacts
  fastify.post('/campaigns/:id/import-contacts', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = importFromContactsSchema.parse(request.body);
    const tenantId = request.tenantId!;

    if (id !== data.campaignId) {
      return reply.code(400).send({ success: false, error: 'Campaign ID mismatch' });
    }

    const campaign = await prisma.linkedInCampaign.findFirst({
      where: { id, tenantId },
    });

    if (!campaign) {
      return reply.code(404).send({ success: false, error: 'Campaign not found' });
    }

    // Get contacts with LinkedIn URLs
    const contacts = await prisma.contact.findMany({
      where: {
        id: { in: data.contactIds },
        tenantId,
        linkedinUrl: { not: null },
      },
    });

    if (contacts.length === 0) {
      return reply.code(400).send({ success: false, error: 'No contacts with LinkedIn URLs found' });
    }

    // Create leads from contacts
    const results = await Promise.allSettled(
      contacts.map(contact =>
        prisma.linkedInCampaignLead.create({
          data: {
            campaignId: id,
            linkedinUrl: contact.linkedinUrl!,
            name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unknown',
            headline: contact.title,
            contactId: contact.id,
          },
        })
      )
    );

    const created = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    // Update campaign lead count
    await prisma.linkedInCampaign.update({
      where: { id },
      data: {
        totalLeads: { increment: created },
      },
    });

    return {
      success: true,
      data: {
        created,
        failed,
        total: contacts.length,
        skippedNoLinkedIn: data.contactIds.length - contacts.length,
      },
    };
  });

  // Get campaign leads
  fastify.get('/campaigns/:id/leads', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status, page = '1', limit = '50' } = request.query as { status?: string; page?: string; limit?: string };
    const tenantId = request.tenantId!;

    const campaign = await prisma.linkedInCampaign.findFirst({
      where: { id, tenantId },
    });

    if (!campaign) {
      return reply.code(404).send({ success: false, error: 'Campaign not found' });
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const leads = await prisma.linkedInCampaignLead.findMany({
      where: {
        campaignId: id,
        ...(status && { status: status as 'PENDING' | 'IN_PROGRESS' | 'CONNECTION_SENT' | 'CONNECTED' | 'MESSAGED' | 'REPLIED' | 'COMPLETED' | 'FAILED' | 'SKIPPED' }),
      },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      include: {
        contact: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
      },
    });

    const total = await prisma.linkedInCampaignLead.count({
      where: {
        campaignId: id,
        ...(status && { status: status as 'PENDING' | 'IN_PROGRESS' | 'CONNECTION_SENT' | 'CONNECTED' | 'MESSAGED' | 'REPLIED' | 'COMPLETED' | 'FAILED' | 'SKIPPED' }),
      },
    });

    return {
      success: true,
      data: leads,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  });

  // Get LinkedIn messages (inbox)
  fastify.get('/messages', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const tenantId = request.tenantId!;
    const { accountId, unread } = request.query as { accountId?: string; unread?: string };

    const messages = await prisma.linkedInMessage.findMany({
      where: {
        tenantId,
        ...(accountId && { accountId }),
        ...(unread === 'true' && { readAt: null, isOutbound: false }),
      },
      orderBy: { sentAt: 'desc' },
      take: 100,
      include: {
        contact: {
          select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
        },
        account: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
    });

    return { success: true, data: messages };
  });

  // Get stats
  fastify.get('/stats', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const tenantId = request.tenantId!;

    const [
      totalAccounts,
      connectedAccounts,
      activeCampaigns,
      totalLeads,
      pendingActions,
      completedToday,
      repliedCount,
      unreadMessages,
    ] = await Promise.all([
      prisma.linkedInAccount.count({ where: { tenantId } }),
      prisma.linkedInAccount.count({ where: { tenantId, status: 'CONNECTED' } }),
      prisma.linkedInCampaign.count({ where: { tenantId, status: 'ACTIVE' } }),
      prisma.linkedInCampaignLead.count({
        where: { campaign: { tenantId } },
      }),
      prisma.linkedInAction.count({ where: { tenantId, status: 'PENDING' } }),
      prisma.linkedInAction.count({
        where: {
          tenantId,
          status: 'COMPLETED',
          executedAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
      prisma.linkedInCampaignLead.count({
        where: { campaign: { tenantId }, status: 'REPLIED' },
      }),
      prisma.linkedInMessage.count({
        where: { tenantId, isOutbound: false, readAt: null },
      }),
    ]);

    return {
      success: true,
      data: {
        totalAccounts,
        connectedAccounts,
        activeCampaigns,
        totalLeads,
        pendingActions,
        completedToday,
        repliedCount,
        unreadMessages,
      },
    };
  });

  // Activate campaign (start processing leads)
  fastify.post('/campaigns/:id/activate', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.tenantId!;

    const campaign = await prisma.linkedInCampaign.findFirst({
      where: { id, tenantId },
      include: {
        account: true,
        steps: { orderBy: { stepNumber: 'asc' } },
        _count: { select: { leads: true } },
      },
    });

    if (!campaign) {
      return reply.code(404).send({ success: false, error: 'Campaign not found' });
    }

    if (campaign._count.leads === 0) {
      return reply.code(400).send({ success: false, error: 'Campaign has no leads' });
    }

    if (campaign.steps.length === 0) {
      return reply.code(400).send({ success: false, error: 'Campaign has no steps defined' });
    }

    if (campaign.account.status !== 'CONNECTED') {
      return reply.code(400).send({ 
        success: false, 
        error: `LinkedIn account is ${campaign.account.status}. Please verify the account first.` 
      });
    }

    // Update campaign status
    const updated = await prisma.linkedInCampaign.update({
      where: { id },
      data: { status: 'ACTIVE' },
      include: { steps: true },
    });

    return { 
      success: true, 
      data: updated,
      message: 'Campaign activated. The LinkedIn Worker will start processing leads shortly.',
    };
  });

  // Pause campaign
  fastify.post('/campaigns/:id/pause', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.tenantId!;

    const campaign = await prisma.linkedInCampaign.findFirst({
      where: { id, tenantId },
    });

    if (!campaign) {
      return reply.code(404).send({ success: false, error: 'Campaign not found' });
    }

    const updated = await prisma.linkedInCampaign.update({
      where: { id },
      data: { status: 'PAUSED' },
    });

    // Also cancel any pending actions for this campaign's leads
    await prisma.linkedInAction.updateMany({
      where: {
        campaignLead: { campaignId: id },
        status: 'PENDING',
      },
      data: { status: 'CANCELLED' },
    });

    return { success: true, data: updated };
  });

  // Verify/reconnect account (trigger worker to login)
  fastify.post('/accounts/:id/verify', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.tenantId!;

    const account = await prisma.linkedInAccount.findFirst({
      where: { id, tenantId },
    });

    if (!account) {
      return reply.code(404).send({ success: false, error: 'Account not found' });
    }

    if (!account.credentials && !account.sessionCookie) {
      return reply.code(400).send({ 
        success: false, 
        error: 'Account has no credentials or session. Please reconnect with credentials.' 
      });
    }

    // Set status to VERIFYING - the worker will pick this up
    const updated = await prisma.linkedInAccount.update({
      where: { id },
      data: {
        status: 'VERIFYING',
        errorCode: null,
        errorMessage: null,
      },
    });

    return { 
      success: true, 
      data: sanitizeAccount(updated),
      message: 'Verification started. The worker will attempt to verify the session.',
    };
  });

  // Toggle warmup mode
  fastify.post('/accounts/:id/warmup', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { enabled } = z.object({ enabled: z.boolean() }).parse(request.body);
    const tenantId = request.tenantId!;

    const account = await prisma.linkedInAccount.findFirst({
      where: { id, tenantId },
    });

    if (!account) {
      return reply.code(404).send({ success: false, error: 'Account not found' });
    }

    const updated = await prisma.linkedInAccount.update({
      where: { id },
      data: {
        isWarmingUp: enabled,
        warmupStartedAt: enabled ? new Date() : null,
        warmupDay: enabled ? 0 : account.warmupDay,
      },
    });

    return { success: true, data: sanitizeAccount(updated) };
  });

  // Get action queue
  fastify.get('/actions', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const tenantId = request.tenantId!;
    const { accountId, status, limit = '50' } = request.query as { 
      accountId?: string; 
      status?: string;
      limit?: string;
    };

    const actions = await prisma.linkedInAction.findMany({
      where: {
        tenantId,
        ...(accountId && { accountId }),
        ...(status && { status: status as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'SKIPPED' | 'CANCELLED' }),
      },
      orderBy: [
        { priority: 'desc' },
        { scheduledAt: 'asc' },
      ],
      take: parseInt(limit),
      include: {
        account: { select: { id: true, name: true, avatarUrl: true } },
        campaignLead: {
          select: { id: true, name: true, linkedinUrl: true, company: true },
        },
      },
    });

    return { success: true, data: actions };
  });

  // Cancel a specific action
  fastify.post('/actions/:id/cancel', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.tenantId!;

    const action = await prisma.linkedInAction.findFirst({
      where: { id, tenantId },
    });

    if (!action) {
      return reply.code(404).send({ success: false, error: 'Action not found' });
    }

    if (action.status !== 'PENDING') {
      return reply.code(400).send({ success: false, error: `Cannot cancel action with status ${action.status}` });
    }

    const updated = await prisma.linkedInAction.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    return { success: true, data: updated };
  });

  // Retry a failed action
  fastify.post('/actions/:id/retry', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.tenantId!;

    const action = await prisma.linkedInAction.findFirst({
      where: { id, tenantId },
    });

    if (!action) {
      return reply.code(404).send({ success: false, error: 'Action not found' });
    }

    if (action.status !== 'FAILED') {
      return reply.code(400).send({ success: false, error: `Cannot retry action with status ${action.status}` });
    }

    const updated = await prisma.linkedInAction.update({
      where: { id },
      data: {
        status: 'PENDING',
        scheduledAt: new Date(),
        attemptCount: 0,
        errorMessage: null,
        errorCode: null,
      },
    });

    return { success: true, data: updated };
  });

  // Skip a lead
  fastify.post('/campaigns/:campaignId/leads/:leadId/skip', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { campaignId, leadId } = request.params as { campaignId: string; leadId: string };
    const tenantId = request.tenantId!;

    const lead = await prisma.linkedInCampaignLead.findFirst({
      where: { id: leadId, campaignId, campaign: { tenantId } },
    });

    if (!lead) {
      return reply.code(404).send({ success: false, error: 'Lead not found' });
    }

    // Update lead status
    await prisma.linkedInCampaignLead.update({
      where: { id: leadId },
      data: { status: 'SKIPPED' },
    });

    // Cancel any pending actions for this lead
    await prisma.linkedInAction.updateMany({
      where: {
        campaignLeadId: leadId,
        status: 'PENDING',
      },
      data: { status: 'CANCELLED' },
    });

    return { success: true };
  });

  // Mark message as read
  fastify.post('/messages/:id/read', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.tenantId!;

    const message = await prisma.linkedInMessage.findFirst({
      where: { id, tenantId },
    });

    if (!message) {
      return reply.code(404).send({ success: false, error: 'Message not found' });
    }

    const updated = await prisma.linkedInMessage.update({
      where: { id },
      data: { readAt: new Date() },
    });

    return { success: true, data: updated };
  });

  // Get account daily stats/usage
  fastify.get('/accounts/:id/usage', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.tenantId!;

    const account = await prisma.linkedInAccount.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        dailyConnectionLimit: true,
        dailyMessageLimit: true,
        dailyViewLimit: true,
        dailyConnectionsSent: true,
        dailyMessagesSent: true,
        dailyViewsDone: true,
        limitsResetAt: true,
        isWarmingUp: true,
        warmupDay: true,
      },
    });

    if (!account) {
      return reply.code(404).send({ success: false, error: 'Account not found' });
    }

    // Calculate effective limits (reduced during warmup)
    const warmupMultiplier = account.isWarmingUp 
      ? Math.min(0.2 + (account.warmupDay * 0.1), 1.0)
      : 1.0;

    return {
      success: true,
      data: {
        connections: {
          used: account.dailyConnectionsSent,
          limit: Math.floor(account.dailyConnectionLimit * warmupMultiplier),
          maxLimit: account.dailyConnectionLimit,
        },
        messages: {
          used: account.dailyMessagesSent,
          limit: Math.floor(account.dailyMessageLimit * warmupMultiplier),
          maxLimit: account.dailyMessageLimit,
        },
        views: {
          used: account.dailyViewsDone,
          limit: Math.floor(account.dailyViewLimit * warmupMultiplier),
          maxLimit: account.dailyViewLimit,
        },
        limitsResetAt: account.limitsResetAt,
        warmup: {
          enabled: account.isWarmingUp,
          day: account.warmupDay,
          multiplier: warmupMultiplier,
        },
      },
    };
  });
}
