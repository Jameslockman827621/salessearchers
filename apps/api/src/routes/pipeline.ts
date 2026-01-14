// ===========================================
// Pipeline & Deals API Routes
// ===========================================

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@salessearchers/db';
import { logger } from '@salessearchers/shared';

const listDealsSchema = z.object({
  stageId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
});

const createDealSchema = z.object({
  name: z.string().min(1).max(200),
  stageId: z.string().uuid(),
  value: z.number().min(0).optional(),
  currency: z.string().max(3).default('USD'),
  probability: z.number().min(0).max(100).optional(),
  expectedCloseDate: z.string().datetime().optional(),
  companyId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

const updateDealSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  stageId: z.string().uuid().optional(),
  value: z.number().min(0).nullable().optional(),
  currency: z.string().max(3).optional(),
  probability: z.number().min(0).max(100).nullable().optional(),
  expectedCloseDate: z.string().datetime().nullable().optional(),
  companyId: z.string().uuid().nullable().optional(),
  ownerId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  lostReason: z.string().nullable().optional(),
});

const createStageSchema = z.object({
  name: z.string().min(1).max(100),
  order: z.number().int().min(0).optional(),
  color: z.string().max(20).optional(),
  isWon: z.boolean().default(false),
  isLost: z.boolean().default(false),
});

const updateStageSchema = createStageSchema.partial();

const addContactToDealSchema = z.object({
  contactId: z.string().uuid(),
  role: z.string().max(50).optional(),
  isPrimary: z.boolean().default(false),
});

export const pipelineRoutes: FastifyPluginAsync = async (fastify) => {
  // ===========================================
  // Pipeline Stages
  // ===========================================

  // List pipeline stages
  fastify.get('/stages', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;

    const stages = await prisma.pipelineStage.findMany({
      where: { tenantId },
      orderBy: { order: 'asc' },
      include: {
        _count: { select: { deals: true } },
      },
    });

    const formattedStages = stages.map((s) => ({
      id: s.id,
      name: s.name,
      order: s.order,
      color: s.color,
      isWon: s.isWon,
      isLost: s.isLost,
      dealCount: s._count.deals,
    }));

    return reply.send({ success: true, data: formattedStages });
  });

  // Create pipeline stage
  fastify.post('/stages', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const data = createStageSchema.parse(request.body);
    const tenantId = request.tenantId!;

    // Determine order if not provided
    let order = data.order;
    if (order === undefined) {
      const maxOrder = await prisma.pipelineStage.aggregate({
        where: { tenantId },
        _max: { order: true },
      });
      order = (maxOrder._max.order ?? -1) + 1;
    }

    const stage = await prisma.pipelineStage.create({
      data: {
        tenantId,
        name: data.name,
        order,
        color: data.color,
        isWon: data.isWon,
        isLost: data.isLost,
      },
    });

    logger.info('Pipeline stage created', { context: 'pipeline', stageId: stage.id });
    return reply.status(201).send({ success: true, data: { id: stage.id } });
  });

  // Update pipeline stage
  fastify.put<{ Params: { id: string } }>('/stages/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const data = updateStageSchema.parse(request.body);
    const tenantId = request.tenantId!;

    const existing = await prisma.pipelineStage.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Pipeline stage not found' },
      });
    }

    const stage = await prisma.pipelineStage.update({
      where: { id },
      data,
    });

    logger.info('Pipeline stage updated', { context: 'pipeline', stageId: id });
    return reply.send({ success: true, data: { id: stage.id } });
  });

  // Delete pipeline stage
  fastify.delete<{ Params: { id: string } }>('/stages/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;

    const stage = await prisma.pipelineStage.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { deals: true } } },
    });

    if (!stage) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Pipeline stage not found' },
      });
    }

    if (stage._count.deals > 0) {
      return reply.status(400).send({
        success: false,
        error: { code: 'HAS_DEALS', message: 'Cannot delete stage with deals. Move deals first.' },
      });
    }

    await prisma.pipelineStage.delete({ where: { id } });

    logger.info('Pipeline stage deleted', { context: 'pipeline', stageId: id });
    return reply.send({ success: true, data: { message: 'Pipeline stage deleted' } });
  });

  // ===========================================
  // Deals
  // ===========================================

  // List deals
  fastify.get('/deals', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const query = listDealsSchema.parse(request.query);
    const tenantId = request.tenantId!;

    const where: Prisma.DealWhereInput = {
      tenantId,
    };

    if (query.stageId) where.stageId = query.stageId;
    if (query.companyId) where.companyId = query.companyId;
    if (query.contactId) {
      where.contacts = { some: { contactId: query.contactId } };
    }

    const deals = await prisma.deal.findMany({
      where,
      include: {
        stage: {
          select: { id: true, name: true, color: true, order: true },
        },
        company: {
          select: { id: true, name: true },
        },
        contacts: {
          include: {
            contact: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
          },
        },
      },
      orderBy: [
        { stage: { order: 'asc' } },
        { updatedAt: 'desc' },
      ],
    });

    const formattedDeals = deals.map((d) => ({
      id: d.id,
      name: d.name,
      value: d.value,
      currency: d.currency,
      probability: d.probability,
      expectedCloseDate: d.expectedClose,
      stage: d.stage,
      company: d.company,
      contacts: d.contacts.map((dc) => dc.contact),
      owner: null, // TODO: Add owner field to Deal model
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));

    return reply.send({ success: true, data: formattedDeals });
  });

  // Get single deal
  fastify.get<{ Params: { id: string } }>('/deals/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;

    const deal = await prisma.deal.findFirst({
      where: { id, tenantId },
      include: {
        stage: true,
        company: {
          select: { id: true, name: true },
        },
        contacts: {
          include: {
            contact: {
              select: { id: true, email: true, firstName: true, lastName: true, title: true },
            },
          },
        },
        tasks: {
          where: { status: { not: 'COMPLETED' } },
          orderBy: { dueAt: 'asc' },
          take: 10,
        },
        emailThreads: {
          orderBy: { lastMessageAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!deal) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Deal not found' },
      });
    }

    return reply.send({ success: true, data: deal });
  });

  // Create deal
  fastify.post('/deals', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const data = createDealSchema.parse(request.body);
    const tenantId = request.tenantId!;

    // Verify stage exists
    const stage = await prisma.pipelineStage.findFirst({
      where: { id: data.stageId, tenantId },
    });

    if (!stage) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_STAGE', message: 'Pipeline stage not found' },
      });
    }

    const deal = await prisma.deal.create({
      data: {
        tenantId,
        name: data.name,
        stageId: data.stageId,
        value: data.value,
        currency: data.currency,
        probability: data.probability,
        expectedClose: data.expectedCloseDate ? new Date(data.expectedCloseDate) : null,
        companyId: data.companyId,
        notes: data.notes,
      },
    });

    // Log activity
    await prisma.activity.create({
      data: {
        tenantId,
        userId: request.userId!,
        dealId: deal.id,
        companyId: data.companyId,
        type: 'deal_created',
        title: 'Deal created',
        description: `${deal.name} - ${data.value ? `$${data.value}` : 'No value'}`,
      },
    });

    logger.info('Deal created', { context: 'pipeline', dealId: deal.id });
    return reply.status(201).send({ success: true, data: { id: deal.id } });
  });

  // Update deal
  fastify.put<{ Params: { id: string } }>('/deals/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const data = updateDealSchema.parse(request.body);
    const tenantId = request.tenantId!;

    const existing = await prisma.deal.findFirst({
      where: { id, tenantId },
      include: { stage: true },
    });

    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Deal not found' },
      });
    }

    // Verify new stage if changing
    if (data.stageId && data.stageId !== existing.stageId) {
      const newStage = await prisma.pipelineStage.findFirst({
        where: { id: data.stageId, tenantId },
      });

      if (!newStage) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_STAGE', message: 'Pipeline stage not found' },
        });
      }

      // Log stage change activity
      await prisma.activity.create({
        data: {
          tenantId,
          userId: request.userId!,
          dealId: id,
          type: 'deal_stage_changed',
          title: 'Deal stage changed',
          description: `${existing.stage?.name ?? 'Unknown'} → ${newStage.name}`,
        },
      });

      // Set closedAt if moving to won/lost stage
      if (newStage.isWon || newStage.isLost) {
        data.expectedCloseDate = undefined; // Will be replaced with closedAt
        await prisma.deal.update({
          where: { id },
          data: { closedAt: new Date() },
        });
      }
    }

    const deal = await prisma.deal.update({
      where: { id },
      data: {
        name: data.name,
        stageId: data.stageId,
        value: data.value,
        currency: data.currency,
        probability: data.probability,
        expectedClose: data.expectedCloseDate ? new Date(data.expectedCloseDate) : undefined,
        companyId: data.companyId,
        notes: data.notes,
        lostReason: data.lostReason,
      },
    });

    logger.info('Deal updated', { context: 'pipeline', dealId: id });
    return reply.send({ success: true, data: { id: deal.id } });
  });

  // Delete deal
  fastify.delete<{ Params: { id: string } }>('/deals/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;

    const deal = await prisma.deal.findFirst({
      where: { id, tenantId },
    });

    if (!deal) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Deal not found' },
      });
    }

    await prisma.deal.delete({ where: { id } });

    logger.info('Deal deleted', { context: 'pipeline', dealId: id });
    return reply.send({ success: true, data: { message: 'Deal deleted' } });
  });

  // Add contact to deal
  fastify.post<{ Params: { dealId: string } }>('/deals/:dealId/contacts', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { dealId } = request.params;
    const data = addContactToDealSchema.parse(request.body);
    const tenantId = request.tenantId!;

    // Verify deal exists
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, tenantId },
    });

    if (!deal) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Deal not found' },
      });
    }

    // Verify contact exists
    const contact = await prisma.contact.findFirst({
      where: { id: data.contactId, tenantId },
    });

    if (!contact) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Contact not found' },
      });
    }

    // If setting as primary, unset other primaries
    if (data.isPrimary) {
      await prisma.dealContact.updateMany({
        where: { dealId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    // Upsert deal-contact relationship
    await prisma.dealContact.upsert({
      where: {
        dealId_contactId: { dealId, contactId: data.contactId },
      },
      create: {
        dealId,
        contactId: data.contactId,
        role: data.role,
        isPrimary: data.isPrimary,
      },
      update: {
        role: data.role,
        isPrimary: data.isPrimary,
      },
    });

    logger.info('Contact added to deal', { context: 'pipeline', dealId, contactId: data.contactId });
    return reply.send({ success: true, data: { message: 'Contact added to deal' } });
  });

  // Remove contact from deal
  fastify.delete<{ Params: { dealId: string; contactId: string } }>('/deals/:dealId/contacts/:contactId', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { dealId, contactId } = request.params;
    const tenantId = request.tenantId!;

    const deal = await prisma.deal.findFirst({
      where: { id: dealId, tenantId },
    });

    if (!deal) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Deal not found' },
      });
    }

    await prisma.dealContact.delete({
      where: {
        dealId_contactId: { dealId, contactId },
      },
    }).catch(() => {
      // Ignore if not found
    });

    logger.info('Contact removed from deal', { context: 'pipeline', dealId, contactId });
    return reply.send({ success: true, data: { message: 'Contact removed from deal' } });
  });
};
