// ===========================================
// Analytics API Routes
// ===========================================

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@salessearchers/db';
import { logger } from '@salessearchers/shared';

// ===========================================
// Routes
// ===========================================

export const analyticsRoutes: FastifyPluginAsync = async (fastify) => {
  // ===========================================
  // Sales Overview
  // ===========================================

  fastify.get('/overview', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;

    const querySchema = z.object({
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
      period: z.enum(['7d', '30d', '90d', '12m']).default('30d'),
    });
    const query = querySchema.parse(request.query);

    // Calculate date range
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    let startDate: Date;
    if (query.startDate) {
      startDate = new Date(query.startDate);
    } else {
      startDate = new Date();
      switch (query.period) {
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(startDate.getDate() - 90);
          break;
        case '12m':
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
      }
    }

    // Get pipeline value by stage
    const dealsByStage = await prisma.deal.groupBy({
      by: ['stageId'],
      where: { tenantId, closedAt: null },
      _sum: { value: true },
      _count: { id: true },
    });

    const stages = await prisma.pipelineStage.findMany({
      where: { tenantId },
      orderBy: { order: 'asc' },
    });

    const pipelineByStage = stages.map((stage) => {
      const stageData = dealsByStage.find((d) => d.stageId === stage.id);
      return {
        stageId: stage.id,
        stageName: stage.name,
        color: stage.color,
        isWon: stage.isWon,
        isLost: stage.isLost,
        dealCount: stageData?._count.id ?? 0,
        totalValue: stageData?._sum.value ?? 0,
      };
    });

    // Get won/lost deals
    const wonDeals = await prisma.deal.aggregate({
      where: {
        tenantId,
        closedAt: { gte: startDate, lte: endDate },
        stage: { isWon: true },
      },
      _sum: { value: true },
      _count: { id: true },
    });

    const lostDeals = await prisma.deal.aggregate({
      where: {
        tenantId,
        closedAt: { gte: startDate, lte: endDate },
        stage: { isLost: true },
      },
      _sum: { value: true },
      _count: { id: true },
    });

    // Get total pipeline value
    const totalPipeline = await prisma.deal.aggregate({
      where: { tenantId, closedAt: null },
      _sum: { value: true },
      _count: { id: true },
    });

    // Get activity counts
    const activityCounts = await prisma.activity.groupBy({
      by: ['type'],
      where: { tenantId, occurredAt: { gte: startDate, lte: endDate } },
      _count: { id: true },
    });

    // Get meeting stats
    const meetingStats = await prisma.meeting.aggregate({
      where: { tenantId, createdAt: { gte: startDate, lte: endDate } },
      _count: { id: true },
    });

    const meetingsWithInsights = await prisma.meeting.count({
      where: {
        tenantId,
        createdAt: { gte: startDate, lte: endDate },
        insights: { some: {} },
      },
    });

    // Get email stats
    const emailsSent = await prisma.emailMessage.count({
      where: {
        tenantId,
        isOutbound: true,
        sentAt: { gte: startDate, lte: endDate },
      },
    });

    const emailsReceived = await prisma.emailMessage.count({
      where: {
        tenantId,
        isOutbound: false,
        receivedAt: { gte: startDate, lte: endDate },
      },
    });

    // Get task completion rate
    const tasksCompleted = await prisma.task.count({
      where: {
        tenantId,
        status: 'COMPLETED',
        completedAt: { gte: startDate, lte: endDate },
      },
    });

    const totalTasks = await prisma.task.count({
      where: {
        tenantId,
        createdAt: { gte: startDate, lte: endDate },
      },
    });

    return reply.send({
      success: true,
      data: {
        period: { startDate, endDate },
        pipeline: {
          totalValue: totalPipeline._sum.value ?? 0,
          dealCount: totalPipeline._count.id,
          byStage: pipelineByStage,
        },
        wonDeals: {
          value: wonDeals._sum.value ?? 0,
          count: wonDeals._count.id,
        },
        lostDeals: {
          value: lostDeals._sum.value ?? 0,
          count: lostDeals._count.id,
        },
        winRate: wonDeals._count.id + lostDeals._count.id > 0
          ? Math.round((wonDeals._count.id / (wonDeals._count.id + lostDeals._count.id)) * 100)
          : 0,
        activities: activityCounts.reduce((acc, item) => ({
          ...acc,
          [item.type]: item._count.id,
        }), {}),
        meetings: {
          total: meetingStats._count.id,
          withInsights: meetingsWithInsights,
        },
        emails: {
          sent: emailsSent,
          received: emailsReceived,
        },
        tasks: {
          completed: tasksCompleted,
          total: totalTasks,
          completionRate: totalTasks > 0 ? Math.round((tasksCompleted / totalTasks) * 100) : 0,
        },
      },
    });
  });

  // ===========================================
  // Deal Forecasting
  // ===========================================

  fastify.get('/forecast', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;

    // Get all open deals with expected close dates
    const deals = await prisma.deal.findMany({
      where: {
        tenantId,
        closedAt: null,
        expectedClose: { not: null },
      },
      include: {
        stage: true,
      },
    });

    // Group by month
    const forecastByMonth: Record<string, { 
      month: string;
      committed: number;
      bestCase: number;
      pipeline: number;
      dealCount: number;
    }> = {};

    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      forecastByMonth[monthKey] = {
        month: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        committed: 0,
        bestCase: 0,
        pipeline: 0,
        dealCount: 0,
      };
    }

    for (const deal of deals) {
      if (!deal.expectedClose || !deal.value) continue;
      
      const monthKey = `${deal.expectedClose.getFullYear()}-${String(deal.expectedClose.getMonth() + 1).padStart(2, '0')}`;
      if (!forecastByMonth[monthKey]) continue;

      const probability = deal.probability ?? (deal.stage?.order ?? 50) / 100 * 100;
      
      forecastByMonth[monthKey].pipeline += deal.value;
      forecastByMonth[monthKey].dealCount += 1;

      if (probability >= 80) {
        forecastByMonth[monthKey].committed += deal.value;
      }
      if (probability >= 50) {
        forecastByMonth[monthKey].bestCase += deal.value;
      }
    }

    // Calculate weighted pipeline
    const weightedPipeline = deals.reduce((sum, deal) => {
      const probability = (deal.probability ?? 50) / 100;
      return sum + (deal.value ?? 0) * probability;
    }, 0);

    return reply.send({
      success: true,
      data: {
        forecast: Object.values(forecastByMonth),
        summary: {
          totalPipeline: deals.reduce((sum, d) => sum + (d.value ?? 0), 0),
          weightedPipeline: Math.round(weightedPipeline),
          dealCount: deals.length,
          avgDealSize: deals.length > 0
            ? Math.round(deals.reduce((sum, d) => sum + (d.value ?? 0), 0) / deals.length)
            : 0,
        },
      },
    });
  });

  // ===========================================
  // Team Performance
  // ===========================================

  fastify.get('/team-performance', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;

    const querySchema = z.object({
      period: z.enum(['7d', '30d', '90d']).default('30d'),
    });
    const query = querySchema.parse(request.query);

    const startDate = new Date();
    switch (query.period) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
    }

    // Get team members
    const members = await prisma.membership.findMany({
      where: { tenantId, isActive: true },
      include: { user: true },
    });

    // Get stats per user
    const teamStats = await Promise.all(
      members.map(async (member) => {
        const [
          dealsWon,
          dealsClosed,
          emailsSent,
          meetingsHeld,
          tasksCompleted,
          activities,
        ] = await Promise.all([
          prisma.deal.aggregate({
            where: {
              tenantId,
              stage: { isWon: true },
              closedAt: { gte: startDate },
            },
            _sum: { value: true },
            _count: { id: true },
          }),
          prisma.deal.count({
            where: {
              tenantId,
              closedAt: { gte: startDate },
            },
          }),
          prisma.emailMessage.count({
            where: {
              tenantId,
              isOutbound: true,
              sentAt: { gte: startDate },
            },
          }),
          prisma.meeting.count({
            where: {
              tenantId,
              userId: member.userId,
              status: 'READY',
              createdAt: { gte: startDate },
            },
          }),
          prisma.task.count({
            where: {
              tenantId,
              assigneeId: member.userId,
              status: 'COMPLETED',
              completedAt: { gte: startDate },
            },
          }),
          prisma.activity.count({
            where: {
              tenantId,
              userId: member.userId,
              occurredAt: { gte: startDate },
            },
          }),
        ]);

        return {
          userId: member.userId,
          name: member.user.firstName 
            ? `${member.user.firstName} ${member.user.lastName ?? ''}`.trim()
            : member.user.email,
          email: member.user.email,
          avatarUrl: member.user.avatarUrl,
          role: member.role,
          stats: {
            dealsWon: dealsWon._count.id,
            revenueWon: dealsWon._sum.value ?? 0,
            dealsClosed,
            emailsSent,
            meetingsHeld,
            tasksCompleted,
            activities,
          },
        };
      })
    );

    return reply.send({
      success: true,
      data: {
        period: { startDate, endDate: new Date() },
        team: teamStats,
      },
    });
  });

  // ===========================================
  // Activity Trends
  // ===========================================

  fastify.get('/trends', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;

    const querySchema = z.object({
      period: z.enum(['7d', '30d', '90d']).default('30d'),
    });
    const query = querySchema.parse(request.query);

    const startDate = new Date();
    switch (query.period) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
    }

    // Daily activity counts
    const dailyActivities = await prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
      SELECT DATE("occurredAt") as date, COUNT(*) as count
      FROM "Activity"
      WHERE "tenantId" = ${tenantId}
        AND "occurredAt" >= ${startDate}
      GROUP BY DATE("occurredAt")
      ORDER BY date ASC
    `;

    // Daily email counts
    const dailyEmails = await prisma.$queryRaw<Array<{ date: Date; sent: bigint; received: bigint }>>`
      SELECT 
        DATE(COALESCE("sentAt", "receivedAt")) as date,
        SUM(CASE WHEN "isOutbound" = true THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN "isOutbound" = false THEN 1 ELSE 0 END) as received
      FROM "EmailMessage"
      WHERE "tenantId" = ${tenantId}
        AND COALESCE("sentAt", "receivedAt") >= ${startDate}
      GROUP BY DATE(COALESCE("sentAt", "receivedAt"))
      ORDER BY date ASC
    `;

    // Daily deals created
    const dailyDeals = await prisma.$queryRaw<Array<{ date: Date; count: bigint; value: number }>>`
      SELECT DATE("createdAt") as date, COUNT(*) as count, SUM(value) as value
      FROM "Deal"
      WHERE "tenantId" = ${tenantId}
        AND "createdAt" >= ${startDate}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `;

    return reply.send({
      success: true,
      data: {
        period: { startDate, endDate: new Date() },
        activities: dailyActivities.map((d) => ({
          date: d.date,
          count: Number(d.count),
        })),
        emails: dailyEmails.map((d) => ({
          date: d.date,
          sent: Number(d.sent),
          received: Number(d.received),
        })),
        deals: dailyDeals.map((d) => ({
          date: d.date,
          count: Number(d.count),
          value: d.value ?? 0,
        })),
      },
    });
  });

  // ===========================================
  // Leaderboard
  // ===========================================

  fastify.get('/leaderboard', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;

    const querySchema = z.object({
      metric: z.enum(['revenue', 'deals', 'activities', 'meetings', 'emails']).default('revenue'),
      period: z.enum(['week', 'month', 'quarter', 'year']).default('month'),
    });
    const query = querySchema.parse(request.query);

    const startDate = new Date();
    switch (query.period) {
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'quarter':
        startDate.setMonth(startDate.getMonth() - 3);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
    }

    const members = await prisma.membership.findMany({
      where: { tenantId, isActive: true },
      include: { user: true },
    });

    const leaderboard = await Promise.all(
      members.map(async (member) => {
        let value = 0;

        switch (query.metric) {
          case 'revenue': {
            const result = await prisma.deal.aggregate({
              where: {
                tenantId,
                stage: { isWon: true },
                closedAt: { gte: startDate },
              },
              _sum: { value: true },
            });
            value = result._sum.value ?? 0;
            break;
          }
          case 'deals': {
            value = await prisma.deal.count({
              where: {
                tenantId,
                stage: { isWon: true },
                closedAt: { gte: startDate },
              },
            });
            break;
          }
          case 'activities': {
            value = await prisma.activity.count({
              where: {
                tenantId,
                userId: member.userId,
                occurredAt: { gte: startDate },
              },
            });
            break;
          }
          case 'meetings': {
            value = await prisma.meeting.count({
              where: {
                tenantId,
                userId: member.userId,
                status: 'READY',
                createdAt: { gte: startDate },
              },
            });
            break;
          }
          case 'emails': {
            value = await prisma.emailMessage.count({
              where: {
                tenantId,
                isOutbound: true,
                sentAt: { gte: startDate },
              },
            });
            break;
          }
        }

        return {
          userId: member.userId,
          name: member.user.firstName 
            ? `${member.user.firstName} ${member.user.lastName ?? ''}`.trim()
            : member.user.email,
          avatarUrl: member.user.avatarUrl,
          value,
        };
      })
    );

    // Sort by value descending
    leaderboard.sort((a, b) => b.value - a.value);

    return reply.send({
      success: true,
      data: {
        metric: query.metric,
        period: query.period,
        leaderboard: leaderboard.map((item, idx) => ({
          ...item,
          rank: idx + 1,
        })),
      },
    });
  });
};

