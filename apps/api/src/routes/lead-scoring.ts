// ===========================================
// Lead Scoring API Routes
// ===========================================

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@salessearchers/db';
import { logger } from '@salessearchers/shared';

// ===========================================
// Schemas
// ===========================================

const eventTypes = [
  'EMAIL_OPENED',
  'EMAIL_CLICKED',
  'EMAIL_REPLIED',
  'EMAIL_BOUNCED',
  'MEETING_SCHEDULED',
  'MEETING_ATTENDED',
  'MEETING_NO_SHOW',
  'DATA_ROOM_VIEWED',
  'DATA_ROOM_CONTENT_VIEWED',
  'LINKEDIN_CONNECTED',
  'LINKEDIN_REPLIED',
  'FORM_SUBMITTED',
  'PAGE_VISITED',
  'DOCUMENT_DOWNLOADED',
  'ENRICHMENT_COMPLETE',
  'DEAL_CREATED',
  'DEAL_STAGE_CHANGED',
  'MANUAL_ADJUSTMENT',
] as const;

const createRuleSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  eventType: z.enum(eventTypes),
  scoreChange: z.number().int().min(-100).max(100),
  conditions: z.record(z.unknown()).optional(),
  decayDays: z.number().int().min(1).max(365).optional(),
  decayAmount: z.number().int().min(1).max(100).optional(),
  isActive: z.boolean().default(true),
  priority: z.number().int().default(0),
});

const updateRuleSchema = createRuleSchema.partial();

const recordEventSchema = z.object({
  contactId: z.string().uuid(),
  eventType: z.enum(eventTypes),
  metadata: z.record(z.unknown()).optional(),
});

const manualAdjustSchema = z.object({
  contactId: z.string().uuid(),
  scoreChange: z.number().int().min(-100).max(100),
  reason: z.string().min(1).max(500),
});

// ===========================================
// Helper: Calculate Grade from Score
// ===========================================

function calculateGrade(score: number): string {
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  if (score >= 20) return 'D';
  return 'F';
}

// ===========================================
// Helper: Get Score Thresholds
// ===========================================

function getGradeThresholds() {
  return [
    { grade: 'A', min: 80, color: '#22c55e', label: 'Hot' },
    { grade: 'B', min: 60, color: '#84cc16', label: 'Warm' },
    { grade: 'C', min: 40, color: '#eab308', label: 'Neutral' },
    { grade: 'D', min: 20, color: '#f97316', label: 'Cool' },
    { grade: 'F', min: 0, color: '#ef4444', label: 'Cold' },
  ];
}

// ===========================================
// Routes
// ===========================================

export const leadScoringRoutes: FastifyPluginAsync = async (fastify) => {
  // ===========================================
  // Get Lead Scores (Leaderboard)
  // ===========================================

  fastify.get('/scores', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;

    const querySchema = z.object({
      grade: z.enum(['A', 'B', 'C', 'D', 'F']).optional(),
      minScore: z.coerce.number().optional(),
      maxScore: z.coerce.number().optional(),
      sortBy: z.enum(['totalScore', 'engagementScore', 'behaviorScore', 'fitScore', 'lastActivity']).default('totalScore'),
      sortOrder: z.enum(['asc', 'desc']).default('desc'),
      limit: z.coerce.number().min(1).max(100).default(50),
      offset: z.coerce.number().min(0).default(0),
    });
    const query = querySchema.parse(request.query);

    const where: Prisma.LeadScoreWhereInput = { tenantId };
    if (query.grade) where.grade = query.grade;
    if (query.minScore !== undefined) where.totalScore = { gte: query.minScore };
    if (query.maxScore !== undefined) {
      where.totalScore = { ...((where.totalScore as object) || {}), lte: query.maxScore };
    }

    const [scores, total] = await Promise.all([
      prisma.leadScore.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        take: query.limit,
        skip: query.offset,
        include: {
          contact: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              title: true,
              company: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.leadScore.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: scores,
      pagination: { total, limit: query.limit, offset: query.offset },
    });
  });

  // ===========================================
  // Get Single Contact Score
  // ===========================================

  fastify.get<{ Params: { contactId: string } }>('/scores/:contactId', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { contactId } = request.params;
    const tenantId = request.tenantId!;

    const score = await prisma.leadScore.findFirst({
      where: { tenantId, contactId },
      include: {
        contact: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            title: true,
            company: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!score) {
      // Return empty score if none exists
      return reply.send({
        success: true,
        data: {
          contactId,
          totalScore: 0,
          engagementScore: 0,
          behaviorScore: 0,
          fitScore: 0,
          grade: 'F',
          scoreHistory: [],
          lastActivity: null,
        },
      });
    }

    // Get recent events
    const recentEvents = await prisma.leadScoreEvent.findMany({
      where: { tenantId, contactId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return reply.send({
      success: true,
      data: {
        ...score,
        recentEvents,
      },
    });
  });

  // ===========================================
  // Record Score Event
  // ===========================================

  fastify.post('/events', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const data = recordEventSchema.parse(request.body);
    const tenantId = request.tenantId!;

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

    // Find matching rules
    const rules = await prisma.leadScoringRule.findMany({
      where: {
        tenantId,
        eventType: data.eventType,
        isActive: true,
      },
      orderBy: { priority: 'desc' },
    });

    if (rules.length === 0) {
      return reply.send({
        success: true,
        data: { message: 'No matching rules found', scoreChange: 0 },
      });
    }

    // Apply first matching rule (or could apply all)
    const rule = rules[0];
    const scoreChange = rule.scoreChange;

    // Get or create lead score
    let leadScore = await prisma.leadScore.findUnique({
      where: { contactId: data.contactId },
    });

    if (!leadScore) {
      leadScore = await prisma.leadScore.create({
        data: {
          tenant: { connect: { id: tenantId } },
          contact: { connect: { id: data.contactId } },
          totalScore: 0,
          engagementScore: 0,
          behaviorScore: 0,
          fitScore: 0,
        },
      });
    }

    // Determine which sub-score to update
    const isEngagement = ['EMAIL_OPENED', 'EMAIL_CLICKED', 'EMAIL_REPLIED', 'LINKEDIN_CONNECTED', 'LINKEDIN_REPLIED'].includes(data.eventType);
    const isBehavior = ['MEETING_ATTENDED', 'DATA_ROOM_VIEWED', 'DATA_ROOM_CONTENT_VIEWED', 'DOCUMENT_DOWNLOADED', 'PAGE_VISITED'].includes(data.eventType);

    const updateData: Prisma.LeadScoreUpdateInput = {
      lastActivity: new Date(),
    };

    if (isEngagement) {
      updateData.engagementScore = { increment: scoreChange };
    } else if (isBehavior) {
      updateData.behaviorScore = { increment: scoreChange };
    } else {
      updateData.fitScore = { increment: scoreChange };
    }

    // Update total score
    updateData.totalScore = { increment: scoreChange };

    // Add to history
    const history = (leadScore.scoreHistory as Array<{ date: string; score: number; change: number; reason: string }>) || [];
    history.push({
      date: new Date().toISOString(),
      score: leadScore.totalScore + scoreChange,
      change: scoreChange,
      reason: `${data.eventType} (Rule: ${rule.name})`,
    });
    // Keep last 50 entries
    if (history.length > 50) history.shift();
    updateData.scoreHistory = history as Prisma.InputJsonValue;

    // Calculate new grade
    const newTotal = Math.max(0, Math.min(100, leadScore.totalScore + scoreChange));
    updateData.grade = calculateGrade(newTotal);

    await prisma.leadScore.update({
      where: { contactId: data.contactId },
      data: updateData,
    });

    // Record event
    await prisma.leadScoreEvent.create({
      data: {
        tenantId,
        contactId: data.contactId,
        ruleId: rule.id,
        eventType: data.eventType,
        scoreChange,
        reason: `${data.eventType} - ${rule.name}`,
        metadata: data.metadata as Prisma.InputJsonValue ?? undefined,
      },
    });

    logger.info('Lead score event recorded', { context: 'lead-scoring', contactId: data.contactId, eventType: data.eventType, scoreChange });

    return reply.send({
      success: true,
      data: {
        scoreChange,
        newTotalScore: newTotal,
        newGrade: calculateGrade(newTotal),
      },
    });
  });

  // ===========================================
  // Manual Score Adjustment
  // ===========================================

  fastify.post('/adjust', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const data = manualAdjustSchema.parse(request.body);
    const tenantId = request.tenantId!;

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

    // Get or create lead score
    let leadScore = await prisma.leadScore.findUnique({
      where: { contactId: data.contactId },
    });

    if (!leadScore) {
      leadScore = await prisma.leadScore.create({
        data: {
          tenant: { connect: { id: tenantId } },
          contact: { connect: { id: data.contactId } },
          totalScore: 0,
          engagementScore: 0,
          behaviorScore: 0,
          fitScore: 0,
        },
      });
    }

    const newTotal = Math.max(0, Math.min(100, leadScore.totalScore + data.scoreChange));
    const history = (leadScore.scoreHistory as Array<{ date: string; score: number; change: number; reason: string }>) || [];
    history.push({
      date: new Date().toISOString(),
      score: newTotal,
      change: data.scoreChange,
      reason: `Manual: ${data.reason}`,
    });
    if (history.length > 50) history.shift();

    await prisma.leadScore.update({
      where: { contactId: data.contactId },
      data: {
        totalScore: newTotal,
        grade: calculateGrade(newTotal),
        scoreHistory: history as Prisma.InputJsonValue,
        lastActivity: new Date(),
      },
    });

    // Record event
    await prisma.leadScoreEvent.create({
      data: {
        tenantId,
        contactId: data.contactId,
        eventType: 'MANUAL_ADJUSTMENT',
        scoreChange: data.scoreChange,
        reason: data.reason,
      },
    });

    return reply.send({
      success: true,
      data: {
        newTotalScore: newTotal,
        newGrade: calculateGrade(newTotal),
      },
    });
  });

  // ===========================================
  // List Scoring Rules
  // ===========================================

  fastify.get('/rules', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;

    const rules = await prisma.leadScoringRule.findMany({
      where: { tenantId },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    return reply.send({
      success: true,
      data: rules,
    });
  });

  // ===========================================
  // Create Scoring Rule
  // ===========================================

  fastify.post('/rules', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const data = createRuleSchema.parse(request.body);
    const tenantId = request.tenantId!;

    const rule = await prisma.leadScoringRule.create({
      data: {
        tenant: { connect: { id: tenantId } },
        name: data.name,
        description: data.description,
        eventType: data.eventType,
        scoreChange: data.scoreChange,
        conditions: data.conditions as Prisma.InputJsonValue ?? undefined,
        decayDays: data.decayDays,
        decayAmount: data.decayAmount,
        isActive: data.isActive,
        priority: data.priority,
      },
    });

    logger.info('Lead scoring rule created', { context: 'lead-scoring', id: rule.id, eventType: data.eventType });

    return reply.status(201).send({
      success: true,
      data: { id: rule.id },
    });
  });

  // ===========================================
  // Update Scoring Rule
  // ===========================================

  fastify.put<{ Params: { id: string } }>('/rules/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const data = updateRuleSchema.parse(request.body);
    const tenantId = request.tenantId!;

    const existing = await prisma.leadScoringRule.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Rule not found' },
      });
    }

    const updateData: Prisma.LeadScoringRuleUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.eventType !== undefined) updateData.eventType = data.eventType;
    if (data.scoreChange !== undefined) updateData.scoreChange = data.scoreChange;
    if (data.conditions !== undefined) updateData.conditions = data.conditions as Prisma.InputJsonValue;
    if (data.decayDays !== undefined) updateData.decayDays = data.decayDays;
    if (data.decayAmount !== undefined) updateData.decayAmount = data.decayAmount;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.priority !== undefined) updateData.priority = data.priority;

    await prisma.leadScoringRule.update({
      where: { id },
      data: updateData,
    });

    return reply.send({ success: true, data: { message: 'Rule updated' } });
  });

  // ===========================================
  // Delete Scoring Rule
  // ===========================================

  fastify.delete<{ Params: { id: string } }>('/rules/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;

    const existing = await prisma.leadScoringRule.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Rule not found' },
      });
    }

    await prisma.leadScoringRule.delete({ where: { id } });

    return reply.send({ success: true, data: { message: 'Rule deleted' } });
  });

  // ===========================================
  // Get Score Distribution
  // ===========================================

  fastify.get('/analytics/distribution', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;

    const grades = await prisma.leadScore.groupBy({
      by: ['grade'],
      where: { tenantId },
      _count: { grade: true },
    });

    const thresholds = getGradeThresholds();
    const distribution = thresholds.map(t => ({
      ...t,
      count: grades.find(g => g.grade === t.grade)?._count.grade ?? 0,
    }));

    const totalScored = distribution.reduce((sum, d) => sum + d.count, 0);
    const totalContacts = await prisma.contact.count({ where: { tenantId } });

    return reply.send({
      success: true,
      data: {
        distribution,
        totalScored,
        totalContacts,
        unscoredCount: totalContacts - totalScored,
      },
    });
  });

  // ===========================================
  // Get Available Event Types
  // ===========================================

  fastify.get('/event-types', {
    preHandler: [fastify.authenticate],
  }, async (_request, reply) => {
    const types = eventTypes.map(type => {
      let category = 'Other';
      let description = '';
      let defaultScore = 0;

      if (type.startsWith('EMAIL_')) {
        category = 'Email';
        if (type === 'EMAIL_OPENED') { description = 'Contact opened an email'; defaultScore = 3; }
        else if (type === 'EMAIL_CLICKED') { description = 'Contact clicked a link'; defaultScore = 5; }
        else if (type === 'EMAIL_REPLIED') { description = 'Contact replied to email'; defaultScore = 10; }
        else if (type === 'EMAIL_BOUNCED') { description = 'Email bounced'; defaultScore = -5; }
      } else if (type.startsWith('MEETING_')) {
        category = 'Meetings';
        if (type === 'MEETING_SCHEDULED') { description = 'Meeting was scheduled'; defaultScore = 15; }
        else if (type === 'MEETING_ATTENDED') { description = 'Contact attended meeting'; defaultScore = 20; }
        else if (type === 'MEETING_NO_SHOW') { description = 'Contact missed meeting'; defaultScore = -10; }
      } else if (type.startsWith('DATA_ROOM_')) {
        category = 'Data Rooms';
        if (type === 'DATA_ROOM_VIEWED') { description = 'Viewed data room'; defaultScore = 10; }
        else if (type === 'DATA_ROOM_CONTENT_VIEWED') { description = 'Viewed specific content'; defaultScore = 5; }
      } else if (type.startsWith('LINKEDIN_')) {
        category = 'LinkedIn';
        if (type === 'LINKEDIN_CONNECTED') { description = 'Accepted connection'; defaultScore = 8; }
        else if (type === 'LINKEDIN_REPLIED') { description = 'Replied to message'; defaultScore = 12; }
      } else if (type.startsWith('DEAL_')) {
        category = 'Deals';
        if (type === 'DEAL_CREATED') { description = 'Deal was created'; defaultScore = 15; }
        else if (type === 'DEAL_STAGE_CHANGED') { description = 'Deal stage changed'; defaultScore = 5; }
      }

      return { type, category, description, defaultScore };
    });

    return reply.send({
      success: true,
      data: types,
    });
  });

  // ===========================================
  // Recalculate All Scores
  // ===========================================

  fastify.post('/recalculate', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;

    // Get all lead scores for this tenant
    const scores = await prisma.leadScore.findMany({
      where: { tenantId },
    });

    let updated = 0;
    for (const score of scores) {
      const newGrade = calculateGrade(score.totalScore);
      if (newGrade !== score.grade) {
        await prisma.leadScore.update({
          where: { id: score.id },
          data: { grade: newGrade },
        });
        updated++;
      }
    }

    return reply.send({
      success: true,
      data: {
        totalScores: scores.length,
        updated,
      },
    });
  });
};

