// ===========================================
// Work OS API Routes - Unified Work Queue
// ===========================================

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@salessearchers/db';
import { logger } from '@salessearchers/shared';

// ===========================================
// Types
// ===========================================

type WorkItemType = 
  | 'EMAIL_REPLY_NEEDED'
  | 'LINKEDIN_REPLY_NEEDED'
  | 'CALL_NOW'
  | 'FOLLOW_UP_DUE'
  | 'SEQUENCE_STEP'
  | 'LINKEDIN_ACTION'
  | 'HOT_SIGNAL'
  | 'TASK';

type WorkItemPriority = 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';

interface WorkItem {
  id: string;
  type: WorkItemType;
  priority: WorkItemPriority;
  title: string;
  subtitle: string | null;
  reason: string;
  createdAt: Date;
  dueAt: Date | null;
  // Contact context
  contactId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactTitle: string | null;
  contactAvatarUrl: string | null;
  companyId: string | null;
  companyName: string | null;
  // Action context
  resourceType: string;
  resourceId: string;
  recommendedAction: string;
  actionUrl: string;
  // Quick action payloads
  canCall: boolean;
  canEmail: boolean;
  canLinkedIn: boolean;
  // Extra metadata
  metadata: Record<string, unknown>;
}

// ===========================================
// Priority Calculation
// ===========================================

function calculatePriority(type: WorkItemType, metadata: Record<string, unknown>): WorkItemPriority {
  // Replies are always urgent
  if (type === 'EMAIL_REPLY_NEEDED' || type === 'LINKEDIN_REPLY_NEEDED') {
    return 'URGENT';
  }
  
  // Hot signals are high priority
  if (type === 'HOT_SIGNAL') {
    return 'HIGH';
  }
  
  // Overdue tasks are urgent
  if (type === 'TASK' && metadata.isOverdue) {
    return 'URGENT';
  }
  
  // Tasks due today are high
  if (type === 'TASK' && metadata.isDueToday) {
    return 'HIGH';
  }
  
  // Callable contacts are high during business hours
  if (type === 'CALL_NOW') {
    return 'HIGH';
  }
  
  // Sequence steps due are medium
  if (type === 'SEQUENCE_STEP') {
    return 'MEDIUM';
  }
  
  // LinkedIn actions are medium
  if (type === 'LINKEDIN_ACTION') {
    return 'MEDIUM';
  }
  
  return 'LOW';
}

const PRIORITY_ORDER: Record<WorkItemPriority, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

// ===========================================
// Routes
// ===========================================

export const workRoutes: FastifyPluginAsync = async (fastify) => {
  // ===========================================
  // Get Unified Work Queue
  // ===========================================

  fastify.get('/queue', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const querySchema = z.object({
      limit: z.coerce.number().min(1).max(100).default(50),
      types: z.string().optional(), // Comma-separated list of types to filter
    });
    const query = querySchema.parse(request.query);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const workItems: WorkItem[] = [];

    // ===========================================
    // 1. Email Replies Needed (Unread inbound threads)
    // ===========================================
    try {
      const unreadThreads = await prisma.emailThread.findMany({
        where: {
          tenantId,
          isArchived: false,
          unreadCount: { gt: 0 },
          messages: {
            some: {
              isOutbound: false,
              receivedAt: { gte: sevenDaysAgo },
            },
          },
        },
        include: {
          messages: {
            where: { isOutbound: false },
            orderBy: { receivedAt: 'desc' },
            take: 1,
          },
          contact: {
            include: { company: true },
          },
          emailConnection: {
            select: { email: true },
          },
        },
        take: 20,
        orderBy: { lastMessageAt: 'desc' },
      });

      for (const thread of unreadThreads) {
        const latestMessage = thread.messages[0];
        const contact = thread.contact;
        
        workItems.push({
          id: `email-${thread.id}`,
          type: 'EMAIL_REPLY_NEEDED',
          priority: 'URGENT',
          title: thread.subject || 'No subject',
          subtitle: thread.snippet || null,
          reason: `Reply needed - ${thread.unreadCount} unread`,
          createdAt: latestMessage?.receivedAt || thread.lastMessageAt || new Date(),
          dueAt: null,
          contactId: contact?.id || null,
          contactName: contact ? [contact.firstName, contact.lastName].filter(Boolean).join(' ') : (latestMessage?.fromName || null),
          contactEmail: contact?.email || latestMessage?.fromEmail || null,
          contactPhone: contact?.phone || null,
          contactTitle: contact?.title || null,
          contactAvatarUrl: contact?.avatarUrl || null,
          companyId: contact?.company?.id || null,
          companyName: contact?.company?.name || null,
          resourceType: 'email_thread',
          resourceId: thread.id,
          recommendedAction: 'REPLY',
          actionUrl: `/inbox?thread=${thread.id}`,
          canCall: !!contact?.phone,
          canEmail: true,
          canLinkedIn: !!contact?.linkedinUrl,
          metadata: {
            fromEmail: latestMessage?.fromEmail,
            unreadCount: thread.unreadCount,
            connectionEmail: thread.emailConnection?.email,
          },
        });
      }
    } catch (error) {
      logger.warn('Failed to fetch email threads for work queue', { error });
    }

    // ===========================================
    // 2. LinkedIn Replies Needed (Inbound messages)
    // ===========================================
    try {
      const linkedInMessages = await prisma.linkedInMessage.findMany({
        where: {
          tenantId,
          isOutbound: false,
          readAt: null,
          sentAt: { gte: sevenDaysAgo },
        },
        include: {
          contact: {
            include: { company: true },
          },
          account: {
            select: { name: true, profileUrl: true },
          },
        },
        take: 20,
        orderBy: { sentAt: 'desc' },
      });

      // Group by threadId to avoid duplicates
      const threadMap = new Map<string, typeof linkedInMessages[0]>();
      for (const msg of linkedInMessages) {
        const key = msg.threadId || msg.id;
        if (!threadMap.has(key)) {
          threadMap.set(key, msg);
        }
      }

      for (const msg of threadMap.values()) {
        const contact = msg.contact;
        
        workItems.push({
          id: `linkedin-msg-${msg.id}`,
          type: 'LINKEDIN_REPLY_NEEDED',
          priority: 'URGENT',
          title: msg.senderName || 'LinkedIn Message',
          subtitle: msg.body?.slice(0, 100) || null,
          reason: 'LinkedIn reply needed',
          createdAt: msg.sentAt,
          dueAt: null,
          contactId: contact?.id || null,
          contactName: contact ? [contact.firstName, contact.lastName].filter(Boolean).join(' ') : msg.senderName,
          contactEmail: contact?.email || null,
          contactPhone: contact?.phone || null,
          contactTitle: contact?.title || null,
          contactAvatarUrl: contact?.avatarUrl || null,
          companyId: contact?.company?.id || null,
          companyName: contact?.company?.name || null,
          resourceType: 'linkedin_message',
          resourceId: msg.id,
          recommendedAction: 'REPLY',
          actionUrl: `/linkedin?tab=inbox&message=${msg.id}`,
          canCall: !!contact?.phone,
          canEmail: !!contact?.email,
          canLinkedIn: true,
          metadata: {
            senderUrl: msg.senderUrl,
            accountName: msg.account?.name,
            threadId: msg.threadId,
          },
        });
      }
    } catch (error) {
      logger.warn('Failed to fetch LinkedIn messages for work queue', { error });
    }

    // ===========================================
    // 3. Tasks Due Today or Overdue
    // ===========================================
    try {
      const tasks = await prisma.task.findMany({
        where: {
          tenantId,
          assignedToId: userId,
          status: { not: 'COMPLETED' },
          dueAt: { lt: todayEnd },
        },
        include: {
          contact: {
            include: { company: true },
          },
        },
        take: 30,
        orderBy: { dueAt: 'asc' },
      });

      for (const task of tasks) {
        const contact = task.contact;
        const isOverdue = task.dueAt && task.dueAt < todayStart;
        const isDueToday = task.dueAt && task.dueAt >= todayStart && task.dueAt < todayEnd;
        
        workItems.push({
          id: `task-${task.id}`,
          type: 'TASK',
          priority: calculatePriority('TASK', { isOverdue, isDueToday }),
          title: task.title,
          subtitle: task.description || null,
          reason: isOverdue ? 'Overdue' : 'Due today',
          createdAt: task.createdAt,
          dueAt: task.dueAt,
          contactId: contact?.id || null,
          contactName: contact ? [contact.firstName, contact.lastName].filter(Boolean).join(' ') : null,
          contactEmail: contact?.email || null,
          contactPhone: contact?.phone || null,
          contactTitle: contact?.title || null,
          contactAvatarUrl: contact?.avatarUrl || null,
          companyId: contact?.company?.id || null,
          companyName: contact?.company?.name || null,
          resourceType: 'task',
          resourceId: task.id,
          recommendedAction: task.type === 'CALL' ? 'CALL' : task.type === 'EMAIL' ? 'EMAIL' : 'COMPLETE',
          actionUrl: `/tasks?id=${task.id}`,
          canCall: !!contact?.phone,
          canEmail: !!contact?.email,
          canLinkedIn: !!contact?.linkedinUrl,
          metadata: {
            taskType: task.type,
            isOverdue,
            isDueToday,
          },
        });
      }
    } catch (error) {
      logger.warn('Failed to fetch tasks for work queue', { error });
    }

    // ===========================================
    // 4. Hot Signals (Data Room Views, Recent Activity)
    // ===========================================
    try {
      // Data room views in the last 24 hours
      const recentViews = await prisma.dataRoomView.findMany({
        where: {
          dataRoom: { tenantId },
          viewedAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
        include: {
          dataRoom: {
            include: {
              contact: { include: { company: true } },
            },
          },
          contact: { include: { company: true } },
        },
        take: 10,
        orderBy: { viewedAt: 'desc' },
      });

      for (const view of recentViews) {
        const contact = view.contact || view.dataRoom.contact;
        if (!contact) continue;
        
        workItems.push({
          id: `signal-dataroom-${view.id}`,
          type: 'HOT_SIGNAL',
          priority: 'HIGH',
          title: `${[contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Someone'} viewed data room`,
          subtitle: view.dataRoom.name,
          reason: 'Hot signal - Data room viewed',
          createdAt: view.viewedAt,
          dueAt: null,
          contactId: contact.id,
          contactName: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || null,
          contactEmail: contact.email,
          contactPhone: contact.phone,
          contactTitle: contact.title,
          contactAvatarUrl: contact.avatarUrl,
          companyId: contact.company?.id || null,
          companyName: contact.company?.name || null,
          resourceType: 'data_room_view',
          resourceId: view.id,
          recommendedAction: 'FOLLOW_UP',
          actionUrl: `/data-rooms/${view.dataRoom.id}`,
          canCall: !!contact.phone,
          canEmail: !!contact.email,
          canLinkedIn: !!contact.linkedinUrl,
          metadata: {
            dataRoomId: view.dataRoom.id,
            dataRoomName: view.dataRoom.name,
            duration: view.duration,
            viewedAt: view.viewedAt,
          },
        });
      }
    } catch (error) {
      logger.warn('Failed to fetch data room views for work queue', { error });
    }

    // ===========================================
    // 5. Pending LinkedIn Actions
    // ===========================================
    try {
      const linkedInActions = await prisma.linkedInAction.findMany({
        where: {
          tenantId,
          status: 'PENDING',
          scheduledAt: { lte: now },
        },
        include: {
          contact: {
            include: { company: true },
          },
          account: {
            select: { name: true, status: true },
          },
        },
        take: 20,
        orderBy: { scheduledAt: 'asc' },
      });

      for (const action of linkedInActions) {
        const contact = action.contact;
        
        workItems.push({
          id: `linkedin-action-${action.id}`,
          type: 'LINKEDIN_ACTION',
          priority: 'MEDIUM',
          title: action.actionType.replace(/_/g, ' ').toLowerCase(),
          subtitle: contact ? [contact.firstName, contact.lastName].filter(Boolean).join(' ') : (action.linkedinUrl || null),
          reason: `LinkedIn ${action.actionType.toLowerCase().replace(/_/g, ' ')} pending`,
          createdAt: action.createdAt,
          dueAt: action.scheduledAt,
          contactId: contact?.id || null,
          contactName: contact ? [contact.firstName, contact.lastName].filter(Boolean).join(' ') : null,
          contactEmail: contact?.email || null,
          contactPhone: contact?.phone || null,
          contactTitle: contact?.title || null,
          contactAvatarUrl: contact?.avatarUrl || null,
          companyId: contact?.company?.id || null,
          companyName: contact?.company?.name || null,
          resourceType: 'linkedin_action',
          resourceId: action.id,
          recommendedAction: 'EXECUTE',
          actionUrl: `/linkedin?tab=queue&action=${action.id}`,
          canCall: !!contact?.phone,
          canEmail: !!contact?.email,
          canLinkedIn: true,
          metadata: {
            actionType: action.actionType,
            accountName: action.account?.name,
            linkedinUrl: action.linkedinUrl,
          },
        });
      }
    } catch (error) {
      logger.warn('Failed to fetch LinkedIn actions for work queue', { error });
    }

    // ===========================================
    // 6. Callable Contacts (from Smart Contacts queue)
    // ===========================================
    try {
      const callableContacts = await prisma.contact.findMany({
        where: {
          tenantId,
          phone: { not: null },
          doNotCall: false,
          status: { not: 'DO_NOT_CONTACT' },
          // Exclude recently contacted
          OR: [
            { lastContactedAt: null },
            { lastContactedAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
          ],
        },
        include: {
          company: true,
          leadScore: true,
        },
        orderBy: { callPriority: 'desc' },
        take: 15,
      });

      for (const contact of callableContacts) {
        workItems.push({
          id: `call-${contact.id}`,
          type: 'CALL_NOW',
          priority: 'HIGH',
          title: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown',
          subtitle: contact.title || contact.company?.name || null,
          reason: contact.leadScore?.grade ? `Grade ${contact.leadScore.grade} lead` : 'Ready to call',
          createdAt: contact.createdAt,
          dueAt: null,
          contactId: contact.id,
          contactName: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || null,
          contactEmail: contact.email,
          contactPhone: contact.phone,
          contactTitle: contact.title,
          contactAvatarUrl: contact.avatarUrl,
          companyId: contact.company?.id || null,
          companyName: contact.company?.name || null,
          resourceType: 'contact',
          resourceId: contact.id,
          recommendedAction: 'CALL',
          actionUrl: `/call-queue?contactId=${contact.id}`,
          canCall: true,
          canEmail: !!contact.email,
          canLinkedIn: !!contact.linkedinUrl,
          metadata: {
            leadScore: contact.leadScore?.totalScore,
            leadGrade: contact.leadScore?.grade,
            callPriority: contact.callPriority,
          },
        });
      }
    } catch (error) {
      logger.warn('Failed to fetch callable contacts for work queue', { error });
    }

    // ===========================================
    // Sort and Filter
    // ===========================================

    // Filter by types if specified
    let filteredItems = workItems;
    if (query.types) {
      const allowedTypes = query.types.split(',') as WorkItemType[];
      filteredItems = workItems.filter(item => allowedTypes.includes(item.type));
    }

    // Sort by priority, then by date
    filteredItems.sort((a, b) => {
      const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Apply limit
    const result = filteredItems.slice(0, query.limit);

    // Calculate summary stats
    const stats = {
      total: filteredItems.length,
      urgent: filteredItems.filter(i => i.priority === 'URGENT').length,
      high: filteredItems.filter(i => i.priority === 'HIGH').length,
      byType: {
        emailReplyNeeded: filteredItems.filter(i => i.type === 'EMAIL_REPLY_NEEDED').length,
        linkedInReplyNeeded: filteredItems.filter(i => i.type === 'LINKEDIN_REPLY_NEEDED').length,
        tasks: filteredItems.filter(i => i.type === 'TASK').length,
        hotSignals: filteredItems.filter(i => i.type === 'HOT_SIGNAL').length,
        linkedInActions: filteredItems.filter(i => i.type === 'LINKEDIN_ACTION').length,
        callNow: filteredItems.filter(i => i.type === 'CALL_NOW').length,
      },
    };

    return reply.send({
      success: true,
      data: {
        items: result,
        stats,
      },
    });
  });

  // ===========================================
  // Get Contact Context (for drawer)
  // ===========================================

  fastify.get<{ Params: { contactId: string } }>('/contact/:contactId/context', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { contactId } = request.params;
    const tenantId = request.tenantId!;

    const contact = await prisma.contact.findFirst({
      where: { id: contactId, tenantId },
      include: {
        company: true,
        leadScore: true,
        tasks: {
          where: { status: { not: 'COMPLETED' } },
          orderBy: { dueAt: 'asc' },
          take: 5,
        },
        sequenceEnrollments: {
          where: { status: 'ACTIVE' },
          include: {
            sequence: { select: { id: true, name: true } },
          },
          take: 3,
        },
        linkedInCampaignLeads: {
          where: { status: { not: 'COMPLETED' } },
          include: {
            campaign: { select: { id: true, name: true } },
          },
          take: 3,
        },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        emailThreads: {
          orderBy: { lastMessageAt: 'desc' },
          take: 3,
          include: {
            messages: {
              orderBy: { receivedAt: 'desc' },
              take: 1,
            },
          },
        },
        linkedInMessages: {
          orderBy: { sentAt: 'desc' },
          take: 3,
        },
        dataRooms: {
          take: 3,
          include: {
            views: {
              orderBy: { viewedAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!contact) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Contact not found' },
      });
    }

    // Determine next best action
    let nextBestAction = { type: 'NONE', label: 'No action', reason: 'No clear next step' };

    // Check for pending tasks
    const overdueTasks = contact.tasks.filter(t => t.dueAt && t.dueAt < new Date());
    if (overdueTasks.length > 0) {
      nextBestAction = { type: 'TASK', label: 'Complete task', reason: `${overdueTasks.length} overdue task(s)` };
    }
    // Check for unread emails
    else if (contact.emailThreads.some(t => t.unreadCount > 0)) {
      nextBestAction = { type: 'EMAIL', label: 'Reply to email', reason: 'Unread email(s)' };
    }
    // Check for LinkedIn messages
    else if (contact.linkedInMessages.some(m => !m.readAt && !m.isOutbound)) {
      nextBestAction = { type: 'LINKEDIN', label: 'Reply on LinkedIn', reason: 'Unread LinkedIn message' };
    }
    // Check if callable
    else if (contact.phone && !contact.doNotCall) {
      nextBestAction = { type: 'CALL', label: 'Call now', reason: 'Has phone number' };
    }
    // Check for active sequences
    else if (contact.sequenceEnrollments.length > 0) {
      nextBestAction = { type: 'WAIT', label: 'In sequence', reason: 'Active email sequence' };
    }
    // Check for LinkedIn campaigns
    else if (contact.linkedInCampaignLeads.length > 0) {
      nextBestAction = { type: 'WAIT', label: 'In campaign', reason: 'Active LinkedIn campaign' };
    }

    return reply.send({
      success: true,
      data: {
        contact: {
          id: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phone,
          title: contact.title,
          linkedinUrl: contact.linkedinUrl,
          avatarUrl: contact.avatarUrl,
          timezone: contact.timezone,
          status: contact.status,
          lastContactedAt: contact.lastContactedAt,
          lastRepliedAt: contact.lastRepliedAt,
        },
        company: contact.company,
        leadScore: contact.leadScore,
        nextBestAction,
        tasks: contact.tasks,
        sequences: contact.sequenceEnrollments.map(e => ({
          id: e.id,
          sequenceId: e.sequence.id,
          sequenceName: e.sequence.name,
          status: e.status,
          currentStep: e.currentStep,
        })),
        linkedInCampaigns: contact.linkedInCampaignLeads.map(l => ({
          id: l.id,
          campaignId: l.campaign.id,
          campaignName: l.campaign.name,
          status: l.status,
          currentStep: l.currentStep,
        })),
        recentActivity: contact.activities,
        emailThreads: contact.emailThreads.map(t => ({
          id: t.id,
          subject: t.subject,
          snippet: t.snippet,
          unreadCount: t.unreadCount,
          lastMessageAt: t.lastMessageAt,
        })),
        linkedInMessages: contact.linkedInMessages.map(m => ({
          id: m.id,
          body: m.body?.slice(0, 100),
          sentAt: m.sentAt,
          isOutbound: m.isOutbound,
        })),
        dataRooms: contact.dataRooms.map(dr => ({
          id: dr.id,
          name: dr.name,
          slug: dr.slug,
          status: dr.status,
          lastViewedAt: dr.views[0]?.viewedAt || null,
        })),
      },
    });
  });

  // ===========================================
  // Quick Actions
  // ===========================================

  fastify.post('/quick-action', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const actionSchema = z.object({
      workItemId: z.string(),
      action: z.enum(['COMPLETE', 'SNOOZE', 'SKIP', 'CALL', 'EMAIL', 'LINKEDIN']),
      snoozeUntil: z.string().datetime().optional(),
      notes: z.string().optional(),
    });
    const data = actionSchema.parse(request.body);

    // Parse work item ID
    const [resourceType, resourceId] = data.workItemId.split('-', 2);

    switch (data.action) {
      case 'COMPLETE':
        if (resourceType === 'task') {
          await prisma.task.update({
            where: { id: resourceId },
            data: { status: 'COMPLETED', completedAt: new Date() },
          });
        } else if (resourceType === 'linkedin' && resourceId.startsWith('action')) {
          await prisma.linkedInAction.update({
            where: { id: resourceId.replace('action-', '') },
            data: { status: 'COMPLETED', executedAt: new Date() },
          });
        }
        break;
        
      case 'SNOOZE':
        if (!data.snoozeUntil) {
          return reply.status(400).send({ success: false, error: 'snoozeUntil is required' });
        }
        if (resourceType === 'task') {
          await prisma.task.update({
            where: { id: resourceId },
            data: { dueAt: new Date(data.snoozeUntil) },
          });
        }
        break;
        
      case 'SKIP':
        if (resourceType === 'linkedin' && resourceId.startsWith('action')) {
          await prisma.linkedInAction.update({
            where: { id: resourceId.replace('action-', '') },
            data: { status: 'SKIPPED' },
          });
        }
        break;
    }

    // Log activity
    await prisma.activity.create({
      data: {
        tenantId,
        userId,
        type: `work_${data.action.toLowerCase()}`,
        title: `${data.action} action on ${resourceType}`,
        description: data.notes || `Quick action: ${data.action}`,
        resourceType,
        resourceId,
      },
    });

    return reply.send({ success: true, data: { message: 'Action completed' } });
  });

  // ===========================================
  // Mark Contact as Contacted (updates timestamps)
  // ===========================================

  fastify.post<{ Params: { contactId: string } }>('/contact/:contactId/touched', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { contactId } = request.params;
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const bodySchema = z.object({
      channel: z.enum(['CALL', 'EMAIL', 'LINKEDIN', 'OTHER']),
      outcome: z.string().optional(),
      notes: z.string().optional(),
    });
    const data = bodySchema.parse(request.body);

    const contact = await prisma.contact.findFirst({
      where: { id: contactId, tenantId },
    });

    if (!contact) {
      return reply.status(404).send({ success: false, error: 'Contact not found' });
    }

    await prisma.contact.update({
      where: { id: contactId },
      data: { lastContactedAt: new Date() },
    });

    // Log activity
    await prisma.activity.create({
      data: {
        tenantId,
        userId,
        contactId,
        type: `contact_${data.channel.toLowerCase()}`,
        title: `Contacted via ${data.channel}`,
        description: data.notes || data.outcome || `Touched via ${data.channel}`,
      },
    });

    return reply.send({ success: true, data: { message: 'Contact marked as touched' } });
  });
};

