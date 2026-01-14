// ===========================================
// Work OS API Routes - Unified Work Queue
// ===========================================

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '@salessearchers/db';
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
  contactId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactTitle: string | null;
  contactAvatarUrl: string | null;
  companyId: string | null;
  companyName: string | null;
  resourceType: string;
  resourceId: string;
  recommendedAction: string;
  actionUrl: string;
  canCall: boolean;
  canEmail: boolean;
  canLinkedIn: boolean;
  metadata: Record<string, unknown>;
}

// ===========================================
// Priority Calculation
// ===========================================

function calculatePriority(type: WorkItemType, metadata: Record<string, unknown>): WorkItemPriority {
  if (type === 'EMAIL_REPLY_NEEDED' || type === 'LINKEDIN_REPLY_NEEDED') {
    return 'URGENT';
  }
  if (type === 'HOT_SIGNAL') {
    return 'HIGH';
  }
  if (type === 'TASK' && metadata.isOverdue) {
    return 'URGENT';
  }
  if (type === 'TASK' && metadata.isDueToday) {
    return 'HIGH';
  }
  if (type === 'CALL_NOW') {
    return 'HIGH';
  }
  if (type === 'SEQUENCE_STEP') {
    return 'MEDIUM';
  }
  if (type === 'LINKEDIN_ACTION') {
    return 'MEDIUM';
  }
  return 'LOW';
}

const PRIORITY_ORDER: Record<WorkItemPriority, number> = {
  'URGENT': 4,
  'HIGH': 3,
  'MEDIUM': 2,
  'LOW': 1,
};

// ===========================================
// Routes
// ===========================================

export const workRoutes: FastifyPluginAsync = async (fastify) => {

  // ===========================================
  // Get Work Queue
  // ===========================================

  fastify.get('/queue', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const querySchema = z.object({
      type: z.enum(['EMAIL_REPLY_NEEDED', 'LINKEDIN_REPLY_NEEDED', 'CALL_NOW', 'FOLLOW_UP_DUE', 'SEQUENCE_STEP', 'LINKEDIN_ACTION', 'HOT_SIGNAL', 'TASK']).optional(),
      limit: z.coerce.number().min(1).max(100).default(50),
    });
    const query = querySchema.parse(request.query);

    const workItems: WorkItem[] = [];
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    // ===========================================
    // 1. Unread Email Replies (URGENT)
    // ===========================================
    if (!query.type || query.type === 'EMAIL_REPLY_NEEDED') {
      try {
        const unreadThreads = await prisma.emailThread.findMany({
          where: {
            tenantId,
            unreadCount: { gt: 0 },
          },
          include: {
            contact: { include: { company: true } },
          },
          take: 20,
          orderBy: { lastMessageAt: 'desc' },
        });

        for (const thread of unreadThreads) {
          const contact = thread.contact;
          workItems.push({
            id: `email-${thread.id}`,
            type: 'EMAIL_REPLY_NEEDED',
            priority: 'URGENT',
            title: thread.subject || 'No subject',
            subtitle: thread.snippet,
            reason: `${thread.unreadCount} unread message(s)`,
            createdAt: thread.lastMessageAt,
            dueAt: null,
            contactId: contact?.id || null,
            contactName: contact ? [contact.firstName, contact.lastName].filter(Boolean).join(' ') : null,
            contactEmail: contact?.email || null,
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
            canEmail: !!contact?.email,
            canLinkedIn: !!contact?.linkedinUrl,
            metadata: { unreadCount: thread.unreadCount },
          });
        }
      } catch (error) {
        logger.warn('Failed to fetch email threads for work queue', { error });
      }
    }

    // ===========================================
    // 2. LinkedIn Replies Needed (URGENT)
    // ===========================================
    if (!query.type || query.type === 'LINKEDIN_REPLY_NEEDED') {
      try {
        const unreadLinkedIn = await prisma.linkedInMessage.findMany({
          where: {
            tenantId,
            isRead: false,
            isOutbound: false,
          },
          include: {
            contact: { include: { company: true } },
            account: true,
          },
          take: 20,
          orderBy: { sentAt: 'desc' },
        });

        for (const msg of unreadLinkedIn) {
          const contact = msg.contact;
          workItems.push({
            id: `linkedin-msg-${msg.id}`,
            type: 'LINKEDIN_REPLY_NEEDED',
            priority: 'URGENT',
            title: contact ? [contact.firstName, contact.lastName].filter(Boolean).join(' ') : 'LinkedIn Message',
            subtitle: msg.body?.slice(0, 100) || null,
            reason: 'Unread LinkedIn message',
            createdAt: msg.sentAt,
            dueAt: null,
            contactId: contact?.id || null,
            contactName: contact ? [contact.firstName, contact.lastName].filter(Boolean).join(' ') : null,
            contactEmail: contact?.email || null,
            contactPhone: contact?.phone || null,
            contactTitle: contact?.title || null,
            contactAvatarUrl: contact?.avatarUrl || null,
            companyId: contact?.company?.id || null,
            companyName: contact?.company?.name || null,
            resourceType: 'linkedin_message',
            resourceId: msg.id,
            recommendedAction: 'REPLY',
            actionUrl: `/linkedin?thread=${msg.threadId}`,
            canCall: !!contact?.phone,
            canEmail: !!contact?.email,
            canLinkedIn: !!contact?.linkedinUrl,
            metadata: {},
          });
        }
      } catch (error) {
        logger.warn('Failed to fetch LinkedIn messages for work queue', { error });
      }
    }

    // ===========================================
    // 3. Tasks Due Today or Overdue
    // ===========================================
    if (!query.type || query.type === 'TASK') {
      try {
        const tasks = await prisma.task.findMany({
          where: {
            tenantId,
            assigneeId: userId,
            status: { not: 'COMPLETED' },
            dueAt: { lt: todayEnd },
          },
          take: 30,
          orderBy: { dueAt: 'asc' },
        });

        for (const task of tasks) {
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
            contactId: task.contactId || null,
            contactName: null,
            contactEmail: null,
            contactPhone: null,
            contactTitle: null,
            contactAvatarUrl: null,
            companyId: null,
            companyName: null,
            resourceType: 'task',
            resourceId: task.id,
            recommendedAction: 'COMPLETE',
            actionUrl: `/tasks?id=${task.id}`,
            canCall: false,
            canEmail: false,
            canLinkedIn: false,
            metadata: { isOverdue, isDueToday },
          });
        }
      } catch (error) {
        logger.warn('Failed to fetch tasks for work queue', { error });
      }
    }

    // ===========================================
    // 4. Pending LinkedIn Actions
    // ===========================================
    if (!query.type || query.type === 'LINKEDIN_ACTION') {
      try {
        const linkedInActions = await prisma.linkedInAction.findMany({
          where: {
            tenantId,
            userId,
            status: 'PENDING',
            scheduledFor: { lte: now },
          },
          include: {
            contact: { include: { company: true } },
            account: true,
          },
          take: 20,
          orderBy: { scheduledFor: 'asc' },
        });

        for (const action of linkedInActions) {
          const contact = action.contact;
          workItems.push({
            id: `linkedin-action-${action.id}`,
            type: 'LINKEDIN_ACTION',
            priority: 'MEDIUM',
            title: `${action.type.replace(/_/g, ' ')}: ${contact ? [contact.firstName, contact.lastName].filter(Boolean).join(' ') : 'Unknown'}`,
            subtitle: action.type === 'MESSAGE' ? action.messageContent?.slice(0, 100) || null : null,
            reason: 'LinkedIn action scheduled',
            createdAt: action.createdAt,
            dueAt: action.scheduledFor,
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
            actionUrl: `/linkedin?action=${action.id}`,
            canCall: !!contact?.phone,
            canEmail: !!contact?.email,
            canLinkedIn: !!contact?.linkedinUrl,
            metadata: { actionType: action.type },
          });
        }
      } catch (error) {
        logger.warn('Failed to fetch LinkedIn actions for work queue', { error });
      }
    }

    // ===========================================
    // 5. Contacts to Call (during business hours)
    // ===========================================
    if (!query.type || query.type === 'CALL_NOW') {
      try {
        const contacts = await prisma.contact.findMany({
          where: {
            tenantId,
            phone: { not: null },
            doNotCall: false,
            OR: [
              { lastContactedAt: null },
              { lastContactedAt: { lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } }, // Not contacted in 7 days
            ],
          },
          include: { company: true, leadScore: true },
          take: 20,
          orderBy: { callPriority: 'desc' },
        });

        for (const contact of contacts) {
          workItems.push({
            id: `call-${contact.id}`,
            type: 'CALL_NOW',
            priority: 'HIGH',
            title: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email || 'Unknown',
            subtitle: contact.title,
            reason: 'Ready to call',
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
            actionUrl: `/call-queue?contact=${contact.id}`,
            canCall: true,
            canEmail: !!contact.email,
            canLinkedIn: !!contact.linkedinUrl,
            metadata: { 
              callPriority: contact.callPriority,
              leadScore: contact.leadScore?.totalScore || 0,
            },
          });
        }
      } catch (error) {
        logger.warn('Failed to fetch contacts for call queue', { error });
      }
    }

    // Sort by priority then by date
    workItems.sort((a, b) => {
      const priorityDiff = PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return (a.dueAt?.getTime() || a.createdAt.getTime()) - (b.dueAt?.getTime() || b.createdAt.getTime());
    });

    // Calculate stats
    const stats = {
      total: workItems.length,
      urgent: workItems.filter(w => w.priority === 'URGENT').length,
      high: workItems.filter(w => w.priority === 'HIGH').length,
      byType: {
        EMAIL_REPLY_NEEDED: workItems.filter(w => w.type === 'EMAIL_REPLY_NEEDED').length,
        LINKEDIN_REPLY_NEEDED: workItems.filter(w => w.type === 'LINKEDIN_REPLY_NEEDED').length,
        CALL_NOW: workItems.filter(w => w.type === 'CALL_NOW').length,
        TASK: workItems.filter(w => w.type === 'TASK').length,
        LINKEDIN_ACTION: workItems.filter(w => w.type === 'LINKEDIN_ACTION').length,
        HOT_SIGNAL: workItems.filter(w => w.type === 'HOT_SIGNAL').length,
        FOLLOW_UP_DUE: workItems.filter(w => w.type === 'FOLLOW_UP_DUE').length,
        SEQUENCE_STEP: workItems.filter(w => w.type === 'SEQUENCE_STEP').length,
      },
    };

    return reply.send({
      success: true,
      data: {
        items: workItems.slice(0, query.limit),
        stats,
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
    const parts = data.workItemId.split('-');
    const resourceType = parts[0];
    const resourceId = parts.slice(1).join('-');

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
      },
    });

    return reply.send({ success: true, data: { message: 'Action completed' } });
  });
};
