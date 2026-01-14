// ===========================================
// AI Content Generation API Routes
// ===========================================

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@salessearchers/db';
import { logger } from '@salessearchers/shared';
import { createOpenAIClient, type ContentGenerationContext } from '@salessearchers/integrations';

// ===========================================
// Schemas
// ===========================================

const generateEmailSchema = z.object({
  type: z.enum(['follow_up', 'cold', 'reply']),
  contactId: z.string().uuid().optional(),
  dealId: z.string().uuid().optional(),
  meetingId: z.string().uuid().optional(),
  template: z.string().optional(),
  customInstructions: z.string().optional(),
});

const generateLinkedInSchema = z.object({
  type: z.enum(['connection', 'inmail', 'reply']),
  contactId: z.string().uuid().optional(),
  customInstructions: z.string().optional(),
});

const generateCallScriptSchema = z.object({
  contactId: z.string().uuid().optional(),
  dealId: z.string().uuid().optional(),
  customInstructions: z.string().optional(),
});

const handleObjectionSchema = z.object({
  objection: z.string().min(1),
  contactId: z.string().uuid().optional(),
  dealId: z.string().uuid().optional(),
});

const improveTextSchema = z.object({
  text: z.string().min(1).max(5000),
  goal: z.enum(['shorter', 'longer', 'formal', 'casual', 'persuasive']),
});

const saveContentSchema = z.object({
  type: z.enum(['FOLLOW_UP_EMAIL', 'MEETING_SUMMARY', 'PROPOSAL_DRAFT', 'ACTION_ITEM_LIST', 'OBJECTION_RESPONSE', 'COACHING_FEEDBACK', 'CALL_SCRIPT', 'LINKEDIN_MESSAGE']),
  title: z.string().optional(),
  content: z.string(),
  sourceType: z.string().optional(),
  sourceId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ===========================================
// Routes
// ===========================================

export const aiRoutes: FastifyPluginAsync = async (fastify) => {
  const openai = createOpenAIClient();

  // ===========================================
  // Build context from IDs
  // ===========================================

  async function buildContext(
    tenantId: string,
    options: { contactId?: string; dealId?: string; meetingId?: string; customInstructions?: string }
  ): Promise<ContentGenerationContext> {
    const context: ContentGenerationContext = {
      customInstructions: options.customInstructions,
    };

    // Load contact info
    if (options.contactId) {
      const contact = await prisma.contact.findFirst({
        where: { id: options.contactId, tenantId },
        include: { company: true },
      });
      if (contact) {
        context.contactName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email || undefined;
        context.contactTitle = contact.title ?? undefined;
        context.companyName = contact.company?.name ?? undefined;
      }
    }

    // Load deal info
    if (options.dealId) {
      const deal = await prisma.deal.findFirst({
        where: { id: options.dealId, tenantId },
        include: { company: true },
      });
      if (deal) {
        context.dealName = deal.name;
        context.dealValue = deal.value ?? undefined;
        if (!context.companyName && deal.company) {
          context.companyName = deal.company.name;
        }
      }
    }

    // Load meeting insights
    if (options.meetingId) {
      const meeting = await prisma.meeting.findFirst({
        where: { id: options.meetingId, tenantId },
        include: { insights: true },
      });
      if (meeting?.insights?.[0]) {
        const insight = meeting.insights[0];
        context.meetingSummary = insight.summary ?? undefined;
        const actionItems = insight.actionItems as Array<{ text: string }> | null;
        if (actionItems) {
          context.actionItems = actionItems.map(a => a.text);
        }
        const objections = insight.objections as Array<{ text: string }> | null;
        if (objections) {
          context.objections = objections.map(o => o.text);
        }
      }
    }

    return context;
  }

  // ===========================================
  // Generate Email
  // ===========================================

  fastify.post('/generate/email', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const data = generateEmailSchema.parse(request.body);
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const context = await buildContext(tenantId, data);

    let result;
    if (data.type === 'follow_up') {
      result = await openai.generateFollowUpEmail(context);
    } else if (data.type === 'cold') {
      result = await openai.generateColdEmail(context, data.template);
    } else {
      result = await openai.generateFollowUpEmail(context); // Reply is similar to follow-up
    }

    // Save to generated content
    await prisma.generatedContent.create({
      data: {
        tenant: { connect: { id: tenantId } },
        user: { connect: { id: userId } },
        type: 'FOLLOW_UP_EMAIL',
        title: result.subject,
        content: result.body,
        sourceType: data.meetingId ? 'meeting' : data.dealId ? 'deal' : data.contactId ? 'contact' : undefined,
        sourceId: data.meetingId ?? data.dealId ?? data.contactId,
        metadata: { tone: result.tone, emailType: data.type } as Prisma.InputJsonValue,
      },
    });

    logger.info('AI email generated', { context: 'ai', type: data.type, userId });

    return reply.send({
      success: true,
      data: result,
    });
  });

  // ===========================================
  // Generate LinkedIn Message
  // ===========================================

  fastify.post('/generate/linkedin', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const data = generateLinkedInSchema.parse(request.body);
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const context = await buildContext(tenantId, data);

    const message = await openai.generateLinkedInMessage(context, data.type);

    // Save to generated content
    await prisma.generatedContent.create({
      data: {
        tenant: { connect: { id: tenantId } },
        user: { connect: { id: userId } },
        type: 'LINKEDIN_MESSAGE',
        content: message,
        sourceType: data.contactId ? 'contact' : undefined,
        sourceId: data.contactId,
        metadata: { messageType: data.type } as Prisma.InputJsonValue,
      },
    });

    logger.info('AI LinkedIn message generated', { context: 'ai', type: data.type, userId });

    return reply.send({
      success: true,
      data: { message },
    });
  });

  // ===========================================
  // Generate Call Script
  // ===========================================

  fastify.post('/generate/call-script', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const data = generateCallScriptSchema.parse(request.body);
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const context = await buildContext(tenantId, data);

    const script = await openai.generateCallScript(context);

    // Save to generated content
    await prisma.generatedContent.create({
      data: {
        tenant: { connect: { id: tenantId } },
        user: { connect: { id: userId } },
        type: 'CALL_SCRIPT',
        content: JSON.stringify(script),
        sourceType: data.dealId ? 'deal' : data.contactId ? 'contact' : undefined,
        sourceId: data.dealId ?? data.contactId,
      },
    });

    logger.info('AI call script generated', { context: 'ai', userId });

    return reply.send({
      success: true,
      data: script,
    });
  });

  // ===========================================
  // Handle Objection
  // ===========================================

  fastify.post('/generate/objection-response', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const data = handleObjectionSchema.parse(request.body);
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const context = await buildContext(tenantId, data);

    const response = await openai.generateObjectionResponse(data.objection, context);

    // Save to generated content
    await prisma.generatedContent.create({
      data: {
        tenant: { connect: { id: tenantId } },
        user: { connect: { id: userId } },
        type: 'OBJECTION_RESPONSE',
        title: data.objection.substring(0, 100),
        content: response,
        sourceType: data.dealId ? 'deal' : data.contactId ? 'contact' : undefined,
        sourceId: data.dealId ?? data.contactId,
      },
    });

    logger.info('AI objection response generated', { context: 'ai', userId });

    return reply.send({
      success: true,
      data: { response },
    });
  });

  // ===========================================
  // Improve Text
  // ===========================================

  fastify.post('/improve', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const data = improveTextSchema.parse(request.body);

    const improved = await openai.improveText(data.text, data.goal);

    return reply.send({
      success: true,
      data: {
        original: data.text,
        improved,
        goal: data.goal,
      },
    });
  });

  // ===========================================
  // Save Generated Content
  // ===========================================

  fastify.post('/save', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const data = saveContentSchema.parse(request.body);
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const content = await prisma.generatedContent.create({
      data: {
        tenant: { connect: { id: tenantId } },
        user: { connect: { id: userId } },
        type: data.type,
        title: data.title,
        content: data.content,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        metadata: (data.metadata as Prisma.InputJsonValue) ?? undefined,
      },
    });

    return reply.status(201).send({
      success: true,
      data: { id: content.id },
    });
  });

  // ===========================================
  // Get Generated Content History
  // ===========================================

  fastify.get('/history', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const querySchema = z.object({
      type: z.string().optional(),
      limit: z.coerce.number().min(1).max(100).default(20),
      offset: z.coerce.number().min(0).default(0),
    });
    const query = querySchema.parse(request.query);

    const where: Prisma.GeneratedContentWhereInput = {
      tenantId,
      userId,
    };
    if (query.type) {
      where.type = query.type as any;
    }

    const [contents, total] = await Promise.all([
      prisma.generatedContent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      prisma.generatedContent.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: contents,
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
      },
    });
  });

  // ===========================================
  // Rate Generated Content
  // ===========================================

  fastify.post<{ Params: { id: string } }>('/:id/rate', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;

    const rateSchema = z.object({
      rating: z.number().min(1).max(5),
      feedback: z.string().optional(),
    });
    const data = rateSchema.parse(request.body);

    const content = await prisma.generatedContent.findFirst({
      where: { id, tenantId },
    });

    if (!content) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Content not found' },
      });
    }

    await prisma.generatedContent.update({
      where: { id },
      data: {
        rating: data.rating,
        feedback: data.feedback,
      },
    });

    return reply.send({
      success: true,
      data: { message: 'Rating saved' },
    });
  });

  // ===========================================
  // Mark Content as Used
  // ===========================================

  fastify.post<{ Params: { id: string } }>('/:id/use', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;

    const useSchema = z.object({
      usedInType: z.string(),
      usedInId: z.string().uuid().optional(),
    });
    const data = useSchema.parse(request.body);

    const content = await prisma.generatedContent.findFirst({
      where: { id, tenantId },
    });

    if (!content) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Content not found' },
      });
    }

    await prisma.generatedContent.update({
      where: { id },
      data: {
        isUsed: true,
        usedAt: new Date(),
        usedInType: data.usedInType,
        usedInId: data.usedInId,
      },
    });

    return reply.send({
      success: true,
      data: { message: 'Content marked as used' },
    });
  });

  // ===========================================
  // Delete Generated Content
  // ===========================================

  fastify.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;

    const content = await prisma.generatedContent.findFirst({
      where: { id, tenantId },
    });

    if (!content) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Content not found' },
      });
    }

    await prisma.generatedContent.delete({ where: { id } });

    return reply.send({
      success: true,
      data: { message: 'Content deleted' },
    });
  });
};

