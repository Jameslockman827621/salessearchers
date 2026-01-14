// ===========================================
// AI Coaching API Routes
// ===========================================

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@salessearchers/db';
import { logger } from '@salessearchers/shared';

const listCoachingTipsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  category: z.string().optional(),
  dismissed: z.enum(['true', 'false']).optional(),
  meetingInsightId: z.string().uuid().optional(),
  severity: z.enum(['positive', 'neutral', 'warning', 'critical']).optional(),
});

export const coachingRoutes: FastifyPluginAsync = async (fastify) => {
  // List coaching tips/feedback
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const query = listCoachingTipsSchema.parse(request.query);
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const where: Prisma.CoachingFeedbackWhereInput = {
      tenantId,
      userId,
    };

    if (query.category) {
      where.category = query.category;
    }

    if (query.dismissed === 'true') {
      where.isAcknowledged = true;
    } else if (query.dismissed === 'false') {
      where.isAcknowledged = false;
    }

    if (query.meetingInsightId) {
      where.meetingId = query.meetingInsightId;
    }

    if (query.severity) {
      where.severity = query.severity;
    }

    const [tips, total] = await Promise.all([
      prisma.coachingFeedback.findMany({
        where,
        include: {
          meeting: {
            select: {
              id: true,
              title: true,
              scheduledAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.coachingFeedback.count({ where }),
    ]);

    const formattedTips = tips.map((t) => ({
      id: t.id,
      category: t.category,
      severity: t.severity,
      title: t.title,
      tip: t.description,
      suggestion: t.suggestion,
      isDismissed: t.isAcknowledged,
      meetingInsight: t.meeting ? {
        id: t.meetingId,
        meeting: {
          id: t.meeting.id,
          title: t.meeting.title,
          scheduledAt: t.meeting.scheduledAt,
        },
      } : null,
      createdAt: t.createdAt,
    }));

    return reply.send({
      success: true,
      data: {
        tips: formattedTips,
        total,
        page: query.page,
        pageSize: query.pageSize,
      },
    });
  });

  // Get coaching stats
  fastify.get('/stats', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const [totalTips, activeTips, byCategory, bySeverity] = await Promise.all([
      prisma.coachingFeedback.count({
        where: { tenantId, userId },
      }),
      prisma.coachingFeedback.count({
        where: { tenantId, userId, isAcknowledged: false },
      }),
      prisma.coachingFeedback.groupBy({
        by: ['category'],
        where: { tenantId, userId },
        _count: { id: true },
      }),
      prisma.coachingFeedback.groupBy({
        by: ['severity'],
        where: { tenantId, userId },
        _count: { id: true },
      }),
    ]);

    return reply.send({
      success: true,
      data: {
        totalTips,
        activeTips,
        dismissedTips: totalTips - activeTips,
        byCategory: byCategory.map((c) => ({
          category: c.category,
          count: c._count.id,
        })),
        bySeverity: bySeverity.map((s) => ({
          severity: s.severity,
          count: s._count.id,
        })),
      },
    });
  });

  // Dismiss coaching tip
  fastify.put<{ Params: { id: string } }>('/:id/dismiss', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const tip = await prisma.coachingFeedback.findFirst({
      where: { id, tenantId, userId },
    });

    if (!tip) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Coaching tip not found' },
      });
    }

    const updated = await prisma.coachingFeedback.update({
      where: { id },
      data: {
        isAcknowledged: true,
        acknowledgedAt: new Date(),
      },
    });

    logger.info('Coaching tip dismissed', { context: 'coaching', tipId: id });

    return reply.send({
      success: true,
      data: { id: updated.id, isDismissed: updated.isAcknowledged },
    });
  });

  // Get coaching session summary (weekly/monthly)
  fastify.get('/sessions', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const sessions = await prisma.coachingSession.findMany({
      where: { tenantId, userId },
      orderBy: { periodStart: 'desc' },
      take: 12, // Last 12 periods
    });

    return reply.send({ success: true, data: sessions });
  });

  // Get current/latest coaching session
  fastify.get('/sessions/current', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    let session = await prisma.coachingSession.findFirst({
      where: {
        tenantId,
        userId,
        periodStart: { lte: now },
        periodEnd: { gte: now },
      },
    });

    // If no current session, get the latest one
    if (!session) {
      session = await prisma.coachingSession.findFirst({
        where: { tenantId, userId },
        orderBy: { periodStart: 'desc' },
      });
    }

    if (!session) {
      // Return empty session data
      return reply.send({
        success: true,
        data: {
          meetingCount: 0,
          totalTalkTime: 0,
          totalListenTime: 0,
          avgTalkRatio: null,
          avgSentiment: null,
          questionsAsked: 0,
          objectionHandled: 0,
          actionItemsCreated: 0,
          followUpsMade: 0,
          strengths: [],
          improvements: [],
          weeklyGoals: [],
          overallScore: null,
        },
      });
    }

    return reply.send({ success: true, data: session });
  });

  // Get meeting-specific coaching insights
  fastify.get<{ Params: { meetingId: string } }>('/meetings/:meetingId', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { meetingId } = request.params;
    const tenantId = request.tenantId!;

    const meeting = await prisma.meeting.findFirst({
      where: { id: meetingId, tenantId },
      include: {
        insights: {
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });

    if (!meeting) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Meeting not found' },
      });
    }

    const feedback = await prisma.coachingFeedback.findMany({
      where: { meetingId, tenantId },
      orderBy: { createdAt: 'asc' },
    });

    const insight = meeting.insights[0];

    return reply.send({
      success: true,
      data: {
        meetingId,
        meetingTitle: meeting.title,
        scheduledAt: meeting.scheduledAt,
        insight: insight ? {
          summary: insight.summary,
          coachingTips: insight.coachingTips,
          sentiment: insight.sentiment,
        } : null,
        feedback: feedback.map((f) => ({
          id: f.id,
          category: f.category,
          severity: f.severity,
          title: f.title,
          description: f.description,
          suggestion: f.suggestion,
          timestamp: f.timestamp,
          isAcknowledged: f.isAcknowledged,
        })),
      },
    });
  });
};
