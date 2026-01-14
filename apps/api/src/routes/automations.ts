// ===========================================
// Workflow Automation API Routes
// ===========================================

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@salessearchers/db';
import { logger } from '@salessearchers/shared';

// ===========================================
// Schemas
// ===========================================

const workflowTriggerTypes = z.enum([
  'DEAL_STAGE_CHANGED',
  'DEAL_CREATED',
  'DEAL_WON',
  'DEAL_LOST',
  'CONTACT_CREATED',
  'CONTACT_ENRICHED',
  'MEETING_COMPLETED',
  'MEETING_SCHEDULED',
  'TASK_COMPLETED',
  'TASK_OVERDUE',
  'EMAIL_RECEIVED',
  'EMAIL_OPENED',
  'EMAIL_REPLIED',
  'LINKEDIN_REPLIED',
  'DATA_ROOM_VIEWED',
  'SEQUENCE_COMPLETED',
  'MANUAL',
  'SCHEDULED',
]);

const actionSchema = z.object({
  type: z.enum([
    'SEND_EMAIL',
    'CREATE_TASK',
    'UPDATE_DEAL_STAGE',
    'ADD_TAG',
    'REMOVE_TAG',
    'ENROLL_SEQUENCE',
    'UNENROLL_SEQUENCE',
    'SEND_SLACK_NOTIFICATION',
    'SEND_WEBHOOK',
    'WAIT',
    'CONDITION',
    'GENERATE_AI_CONTENT',
  ]),
  config: z.record(z.unknown()),
  order: z.number().int().min(0),
});

const createAutomationSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  triggerType: workflowTriggerTypes,
  triggerConfig: z.record(z.unknown()).optional(),
  actions: z.array(actionSchema).min(1),
  isActive: z.boolean().default(true),
});

const updateAutomationSchema = createAutomationSchema.partial();

const triggerManualSchema = z.object({
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  data: z.record(z.unknown()).optional(),
});

// ===========================================
// Action Executors
// ===========================================

type ActionConfig = Record<string, unknown>;
type ActionContext = {
  tenantId: string;
  userId?: string;
  entityType?: string;
  entityId?: string;
  triggerData?: Record<string, unknown>;
};

async function executeAction(
  action: { type: string; config: ActionConfig },
  context: ActionContext
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    switch (action.type) {
      case 'CREATE_TASK': {
        const config = action.config as { 
          title: string; 
          description?: string; 
          priority?: string;
          dueInDays?: number;
          assigneeId?: string;
        };
        
        const dueDate = config.dueInDays 
          ? new Date(Date.now() + config.dueInDays * 24 * 60 * 60 * 1000)
          : undefined;
        
        const taskData: Parameters<typeof prisma.task.create>[0]['data'] = {
          tenant: { connect: { id: context.tenantId } },
          title: config.title,
          description: config.description,
          priority: (config.priority as 'LOW' | 'MEDIUM' | 'HIGH') ?? 'MEDIUM',
          status: 'PENDING',
          dueAt: dueDate,
          source: 'automation',
        };
        if (config.assigneeId) {
          taskData.assignee = { connect: { id: config.assigneeId } };
        }
        if (context.userId) {
          taskData.creator = { connect: { id: context.userId } };
        }
        if (context.entityType === 'contact' && context.entityId) {
          taskData.contact = { connect: { id: context.entityId } };
        }
        if (context.entityType === 'deal' && context.entityId) {
          taskData.deal = { connect: { id: context.entityId } };
        }
        const task = await prisma.task.create({ data: taskData });
        return { success: true, result: { taskId: task.id } };
      }

      case 'UPDATE_DEAL_STAGE': {
        const config = action.config as { stageId: string };
        if (context.entityType !== 'deal' || !context.entityId) {
          return { success: false, error: 'No deal context available' };
        }
        
        await prisma.deal.update({
          where: { id: context.entityId },
          data: { stageId: config.stageId },
        });
        return { success: true, result: { newStageId: config.stageId } };
      }

      case 'ENROLL_SEQUENCE': {
        const config = action.config as { sequenceId: string; contactId?: string; emailConnectionId?: string };
        const contactId = config.contactId ?? (context.entityType === 'contact' ? context.entityId : undefined);
        
        if (!contactId) {
          return { success: false, error: 'No contact ID available' };
        }
        
        // Check if already enrolled
        const existing = await prisma.sequenceEnrollment.findFirst({
          where: {
            sequenceId: config.sequenceId,
            contactId,
            status: { in: ['ACTIVE', 'PAUSED'] },
          },
        });
        
        if (existing) {
          return { success: false, error: 'Contact already enrolled in sequence' };
        }
        
        const contact = await prisma.contact.findFirst({
          where: { id: contactId, tenantId: context.tenantId },
        });
        
        if (!contact?.email) {
          return { success: false, error: 'Contact has no email' };
        }

        // Get the first available email connection for this tenant
        let emailConnectionId = config.emailConnectionId;
        if (!emailConnectionId) {
          const emailConnection = await prisma.emailConnection.findFirst({
            where: { tenantId: context.tenantId, isActive: true },
          });
          if (!emailConnection) {
            return { success: false, error: 'No email connection available' };
          }
          emailConnectionId = emailConnection.id;
        }
        
        const enrollment = await prisma.sequenceEnrollment.create({
          data: {
            tenant: { connect: { id: context.tenantId } },
            sequence: { connect: { id: config.sequenceId } },
            contact: { connect: { id: contactId } },
            emailConnection: { connect: { id: emailConnectionId } },
            status: 'ACTIVE',
            currentStepNumber: 0,
          },
        });
        
        return { success: true, result: { enrollmentId: enrollment.id } };
      }

      case 'UNENROLL_SEQUENCE': {
        const config = action.config as { sequenceId?: string; contactId?: string };
        const contactId = config.contactId ?? (context.entityType === 'contact' ? context.entityId : undefined);
        
        if (!contactId) {
          return { success: false, error: 'No contact ID available' };
        }
        
        const where: Prisma.SequenceEnrollmentWhereInput = {
          contactId,
          status: { in: ['ACTIVE', 'PAUSED'] },
        };
        if (config.sequenceId) {
          where.sequenceId = config.sequenceId;
        }
        
        const updated = await prisma.sequenceEnrollment.updateMany({
          where,
          data: { status: 'UNSUBSCRIBED' },
        });
        
        return { success: true, result: { unenrolledCount: updated.count } };
      }

      case 'SEND_WEBHOOK': {
        const config = action.config as { url: string; method?: string; headers?: Record<string, string> };
        
        const response = await fetch(config.url, {
          method: config.method ?? 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...config.headers,
          },
          body: JSON.stringify({
            trigger: context.triggerData,
            entityType: context.entityType,
            entityId: context.entityId,
            timestamp: new Date().toISOString(),
          }),
        });
        
        return { 
          success: response.ok, 
          result: { statusCode: response.status },
          error: response.ok ? undefined : `Webhook returned ${response.status}`,
        };
      }

      case 'WAIT': {
        const config = action.config as { minutes?: number; hours?: number; days?: number };
        const totalMs = 
          (config.minutes ?? 0) * 60 * 1000 +
          (config.hours ?? 0) * 60 * 60 * 1000 +
          (config.days ?? 0) * 24 * 60 * 60 * 1000;
        
        // For now, we'll just note the wait time. In production, this would be handled by Temporal
        return { success: true, result: { waitMs: totalMs, note: 'Wait handled by workflow engine' } };
      }

      case 'SEND_SLACK_NOTIFICATION': {
        const config = action.config as { webhookUrl: string; message: string };
        
        const response = await fetch(config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: config.message }),
        });
        
        return { 
          success: response.ok, 
          error: response.ok ? undefined : 'Slack webhook failed',
        };
      }

      default:
        return { success: false, error: `Unknown action type: ${action.type}` };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

// ===========================================
// Routes
// ===========================================

export const automationsRoutes: FastifyPluginAsync = async (fastify) => {
  // ===========================================
  // List Automations
  // ===========================================

  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;

    const querySchema = z.object({
      isActive: z.coerce.boolean().optional(),
      triggerType: workflowTriggerTypes.optional(),
      limit: z.coerce.number().min(1).max(100).default(50),
      offset: z.coerce.number().min(0).default(0),
    });
    const query = querySchema.parse(request.query);

    const where: Prisma.WorkflowAutomationWhereInput = { tenantId };
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.triggerType) where.triggerType = query.triggerType;

    const [automations, total] = await Promise.all([
      prisma.workflowAutomation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
        include: {
          createdBy: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          _count: { select: { runs: true } },
        },
      }),
      prisma.workflowAutomation.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: automations,
      pagination: { total, limit: query.limit, offset: query.offset },
    });
  });

  // ===========================================
  // Get Single Automation
  // ===========================================

  fastify.get<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;

    const automation = await prisma.workflowAutomation.findFirst({
      where: { id, tenantId },
      include: {
        createdBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        runs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!automation) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Automation not found' },
      });
    }

    return reply.send({ success: true, data: automation });
  });

  // ===========================================
  // Create Automation
  // ===========================================

  fastify.post('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const data = createAutomationSchema.parse(request.body);
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const automation = await prisma.workflowAutomation.create({
      data: {
        tenant: { connect: { id: tenantId } },
        createdBy: { connect: { id: userId } },
        name: data.name,
        description: data.description,
        triggerType: data.triggerType,
        triggerConfig: data.triggerConfig as Prisma.InputJsonValue ?? undefined,
        actions: data.actions as unknown as Prisma.InputJsonValue,
        isActive: data.isActive,
      },
    });

    logger.info('Workflow automation created', { context: 'automations', id: automation.id, trigger: data.triggerType });

    return reply.status(201).send({
      success: true,
      data: { id: automation.id },
    });
  });

  // ===========================================
  // Update Automation
  // ===========================================

  fastify.put<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const data = updateAutomationSchema.parse(request.body);
    const tenantId = request.tenantId!;

    const existing = await prisma.workflowAutomation.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Automation not found' },
      });
    }

    const updateData: Prisma.WorkflowAutomationUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.triggerType !== undefined) updateData.triggerType = data.triggerType;
    if (data.triggerConfig !== undefined) updateData.triggerConfig = data.triggerConfig as Prisma.InputJsonValue;
    if (data.actions !== undefined) updateData.actions = data.actions as unknown as Prisma.InputJsonValue;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    await prisma.workflowAutomation.update({
      where: { id },
      data: updateData,
    });

    return reply.send({ success: true, data: { message: 'Automation updated' } });
  });

  // ===========================================
  // Delete Automation
  // ===========================================

  fastify.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;

    const existing = await prisma.workflowAutomation.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Automation not found' },
      });
    }

    await prisma.workflowAutomation.delete({ where: { id } });

    logger.info('Workflow automation deleted', { context: 'automations', id });

    return reply.send({ success: true, data: { message: 'Automation deleted' } });
  });

  // ===========================================
  // Toggle Automation Active State
  // ===========================================

  fastify.post<{ Params: { id: string } }>('/:id/toggle', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;

    const existing = await prisma.workflowAutomation.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Automation not found' },
      });
    }

    await prisma.workflowAutomation.update({
      where: { id },
      data: { isActive: !existing.isActive },
    });

    return reply.send({
      success: true,
      data: { isActive: !existing.isActive },
    });
  });

  // ===========================================
  // Trigger Automation Manually
  // ===========================================

  fastify.post<{ Params: { id: string } }>('/:id/trigger', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const data = triggerManualSchema.parse(request.body);
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const automation = await prisma.workflowAutomation.findFirst({
      where: { id, tenantId },
    });

    if (!automation) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Automation not found' },
      });
    }

    // Create run record
    const run = await prisma.workflowRun.create({
      data: {
        automation: { connect: { id } },
        tenantId,
        triggerData: data.data as Prisma.InputJsonValue ?? undefined,
        entityType: data.entityType,
        entityId: data.entityId,
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    // Execute actions
    const actions = automation.actions as Array<{ type: string; config: ActionConfig; order: number }>;
    const sortedActions = actions.sort((a, b) => a.order - b.order);
    
    const results: Array<{ order: number; type: string; success: boolean; result?: unknown; error?: string }> = [];
    let allSucceeded = true;

    for (const action of sortedActions) {
      const result = await executeAction(action, {
        tenantId,
        userId,
        entityType: data.entityType,
        entityId: data.entityId,
        triggerData: data.data,
      });
      
      results.push({
        order: action.order,
        type: action.type,
        ...result,
      });

      if (!result.success) {
        allSucceeded = false;
        // For now, continue with other actions. Could add failOnError config.
      }
    }

    // Update run with results
    await prisma.workflowRun.update({
      where: { id: run.id },
      data: {
        status: allSucceeded ? 'COMPLETED' : 'FAILED',
        completedAt: new Date(),
        actionsExecuted: results.filter(r => r.success).length,
        actionResults: results as unknown as Prisma.InputJsonValue,
        error: allSucceeded ? undefined : results.find(r => !r.success)?.error,
      },
    });

    // Update automation stats
    await prisma.workflowAutomation.update({
      where: { id },
      data: {
        runCount: { increment: 1 },
        lastRunAt: new Date(),
        lastError: allSucceeded ? null : results.find(r => !r.success)?.error,
      },
    });

    logger.info('Workflow automation triggered', { context: 'automations', id, runId: run.id, success: allSucceeded });

    return reply.send({
      success: true,
      data: {
        runId: run.id,
        status: allSucceeded ? 'COMPLETED' : 'FAILED',
        results,
      },
    });
  });

  // ===========================================
  // Get Automation Runs
  // ===========================================

  fastify.get<{ Params: { id: string } }>('/:id/runs', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;

    const querySchema = z.object({
      status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']).optional(),
      limit: z.coerce.number().min(1).max(100).default(20),
      offset: z.coerce.number().min(0).default(0),
    });
    const query = querySchema.parse(request.query);

    // Verify automation exists
    const automation = await prisma.workflowAutomation.findFirst({
      where: { id, tenantId },
    });

    if (!automation) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Automation not found' },
      });
    }

    const where: Prisma.WorkflowRunWhereInput = { automationId: id };
    if (query.status) where.status = query.status;

    const [runs, total] = await Promise.all([
      prisma.workflowRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      prisma.workflowRun.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: runs,
      pagination: { total, limit: query.limit, offset: query.offset },
    });
  });

  // ===========================================
  // Get Available Triggers
  // ===========================================

  fastify.get('/meta/triggers', {
    preHandler: [fastify.authenticate],
  }, async (_request, reply) => {
    const triggers = [
      { type: 'DEAL_STAGE_CHANGED', name: 'Deal Stage Changed', category: 'Deals', configOptions: ['fromStage', 'toStage'] },
      { type: 'DEAL_CREATED', name: 'Deal Created', category: 'Deals', configOptions: [] },
      { type: 'DEAL_WON', name: 'Deal Won', category: 'Deals', configOptions: [] },
      { type: 'DEAL_LOST', name: 'Deal Lost', category: 'Deals', configOptions: [] },
      { type: 'CONTACT_CREATED', name: 'Contact Created', category: 'Contacts', configOptions: [] },
      { type: 'CONTACT_ENRICHED', name: 'Contact Enriched', category: 'Contacts', configOptions: [] },
      { type: 'MEETING_COMPLETED', name: 'Meeting Completed', category: 'Meetings', configOptions: [] },
      { type: 'MEETING_SCHEDULED', name: 'Meeting Scheduled', category: 'Meetings', configOptions: [] },
      { type: 'TASK_COMPLETED', name: 'Task Completed', category: 'Tasks', configOptions: [] },
      { type: 'TASK_OVERDUE', name: 'Task Overdue', category: 'Tasks', configOptions: [] },
      { type: 'EMAIL_RECEIVED', name: 'Email Received', category: 'Email', configOptions: ['fromDomain'] },
      { type: 'EMAIL_OPENED', name: 'Email Opened', category: 'Email', configOptions: ['sequenceId'] },
      { type: 'EMAIL_REPLIED', name: 'Email Replied', category: 'Email', configOptions: [] },
      { type: 'LINKEDIN_REPLIED', name: 'LinkedIn Reply Received', category: 'LinkedIn', configOptions: [] },
      { type: 'DATA_ROOM_VIEWED', name: 'Data Room Viewed', category: 'Data Rooms', configOptions: ['dataRoomId'] },
      { type: 'SEQUENCE_COMPLETED', name: 'Sequence Completed', category: 'Sequences', configOptions: ['sequenceId'] },
      { type: 'MANUAL', name: 'Manual Trigger', category: 'Other', configOptions: [] },
      { type: 'SCHEDULED', name: 'Scheduled', category: 'Other', configOptions: ['cronExpression', 'timezone'] },
    ];

    return reply.send({ success: true, data: triggers });
  });

  // ===========================================
  // Get Available Actions
  // ===========================================

  fastify.get('/meta/actions', {
    preHandler: [fastify.authenticate],
  }, async (_request, reply) => {
    const actions = [
      { type: 'SEND_EMAIL', name: 'Send Email', category: 'Communication', configFields: ['templateId', 'subject', 'body'] },
      { type: 'CREATE_TASK', name: 'Create Task', category: 'Tasks', configFields: ['title', 'description', 'priority', 'dueInDays', 'assigneeId'] },
      { type: 'UPDATE_DEAL_STAGE', name: 'Update Deal Stage', category: 'Deals', configFields: ['stageId'] },
      { type: 'ADD_TAG', name: 'Add Tag', category: 'Organization', configFields: ['tagName'] },
      { type: 'REMOVE_TAG', name: 'Remove Tag', category: 'Organization', configFields: ['tagName'] },
      { type: 'ENROLL_SEQUENCE', name: 'Enroll in Sequence', category: 'Sequences', configFields: ['sequenceId'] },
      { type: 'UNENROLL_SEQUENCE', name: 'Unenroll from Sequence', category: 'Sequences', configFields: ['sequenceId'] },
      { type: 'SEND_SLACK_NOTIFICATION', name: 'Send Slack Notification', category: 'Notifications', configFields: ['webhookUrl', 'message'] },
      { type: 'SEND_WEBHOOK', name: 'Send Webhook', category: 'Integrations', configFields: ['url', 'method', 'headers'] },
      { type: 'WAIT', name: 'Wait', category: 'Flow', configFields: ['minutes', 'hours', 'days'] },
      { type: 'CONDITION', name: 'Condition', category: 'Flow', configFields: ['field', 'operator', 'value', 'thenActions', 'elseActions'] },
      { type: 'GENERATE_AI_CONTENT', name: 'Generate AI Content', category: 'AI', configFields: ['contentType', 'customInstructions'] },
    ];

    return reply.send({ success: true, data: actions });
  });
};

