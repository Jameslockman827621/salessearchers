// ===========================================
// Meetings Routes (Complete Implementation)
// ===========================================

import { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma, Prisma } from '@salessearchers/db';
import {
  createMeetingSchema,
  listMeetingsQuerySchema,
  NotFoundError,
  parseMeetingUrl,
  AUDIT_ACTIONS,
  logger,
} from '@salessearchers/shared';
import { createStorageClient } from '@salessearchers/integrations';
import { startMeetingBotWorkflow, startMeetingInsightsWorkflow, cancelMeetingBotWorkflow } from '../lib/temporal';

export async function meetingsRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', app.authenticate);

  const storage = createStorageClient();

  // List meetings
  app.get('/', async (request: FastifyRequest) => {
    await app.requirePermission('meetings.read')(request, {} as never);

    const query = listMeetingsQuerySchema.parse(request.query);
    const tenantId = request.tenantId!;

    const where: Prisma.MeetingWhereInput = {
      tenantId,
      ...(query.status && { status: query.status }),
      ...(query.userId && { userId: query.userId }),
      ...(query.from && { scheduledAt: { gte: query.from } }),
      ...(query.to && { scheduledAt: { lte: query.to } }),
    };

    const [meetings, total] = await Promise.all([
      prisma.meeting.findMany({
        where,
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          calendarEvent: {
            select: { id: true, title: true, attendees: true },
          },
          botSession: {
            select: { id: true, providerBotId: true, joinedAt: true, leftAt: true },
          },
          _count: {
            select: { assets: true, insights: true },
          },
        },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { scheduledAt: 'desc' },
      }),
      prisma.meeting.count({ where }),
    ]);

    return {
      success: true,
      data: meetings.map((m) => ({
        ...m,
        hasRecording: m._count.assets > 0,
        hasInsights: m._count.insights > 0,
        _count: undefined,
      })),
      meta: {
        requestId: request.id,
        timestamp: new Date().toISOString(),
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total,
          totalPages: Math.ceil(total / query.pageSize),
        },
      },
    };
  });

  // Get meeting by ID
  app.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>) => {
    await app.requirePermission('meetings.read')(request, {} as never);

    const { id } = request.params;
    const tenantId = request.tenantId!;

    const meeting = await prisma.meeting.findFirst({
      where: { id, tenantId },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        calendarEvent: true,
        botSession: true,
        assets: true,
        transcript: true,
        insights: {
          orderBy: { version: 'desc' },
          take: 1,
        },
        participants: {
          include: {
            contact: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });

    if (!meeting) {
      throw new NotFoundError('Meeting', id);
    }

    // Generate signed URLs for assets
    const assetsWithUrls = await Promise.all(
      meeting.assets.map(async (asset) => {
        try {
          const url = await storage.getSignedDownloadUrl(asset.storageKey);
          return { ...asset, url };
        } catch {
          return { ...asset, url: null };
        }
      })
    );

    return {
      success: true,
      data: {
        ...meeting,
        assets: assetsWithUrls,
        insight: meeting.insights[0] ?? null,
        insights: undefined,
      },
    };
  });

  // Create meeting (manual)
  app.post('/', async (request: FastifyRequest) => {
    await app.requirePermission('meetings.create')(request, {} as never);

    const body = createMeetingSchema.parse(request.body);
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    // Parse meeting URL to detect platform
    const parsed = parseMeetingUrl(body.meetingUrl);
    if (!parsed) {
      throw new Error('Invalid meeting URL. Supported platforms: Zoom, Google Meet, Microsoft Teams, Webex');
    }

    const meeting = await prisma.meeting.create({
      data: {
        tenantId,
        userId,
        meetingUrl: body.meetingUrl,
        title: body.title,
        platform: parsed.platform,
        scheduledAt: body.scheduledAt,
        status: 'SCHEDULED',
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: AUDIT_ACTIONS.MEETING_CREATED,
        resource: 'meeting',
        resourceId: meeting.id,
        details: { meetingUrl: body.meetingUrl, platform: parsed.platform },
      },
    });

    // Start bot workflow
    try {
      await startMeetingBotWorkflow({
        meetingId: meeting.id,
        meetingUrl: body.meetingUrl,
        tenantId,
        userId,
        scheduledAt: body.scheduledAt?.toISOString(),
      });

      logger.info('Started meeting bot workflow', { meetingId: meeting.id });
    } catch (error) {
      logger.error('Failed to start meeting bot workflow', { meetingId: meeting.id }, error as Error);
      // Don't fail the request - the meeting is created, workflow can be retried
    }

    return {
      success: true,
      data: meeting,
    };
  });

  // Cancel meeting recording
  app.post('/:id/cancel', async (request: FastifyRequest<{ Params: { id: string } }>) => {
    await app.requirePermission('meetings.update')(request, {} as never);

    const { id } = request.params;
    const tenantId = request.tenantId!;

    const meeting = await prisma.meeting.findFirst({
      where: { id, tenantId },
    });

    if (!meeting) {
      throw new NotFoundError('Meeting', id);
    }

    if (!['SCHEDULED', 'BOT_JOINING'].includes(meeting.status)) {
      throw new Error('Cannot cancel meeting that has already started or completed');
    }

    await prisma.meeting.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    // Cancel the workflow
    try {
      await cancelMeetingBotWorkflow(id);
    } catch (error) {
      logger.warn('Could not cancel workflow', { meetingId: id, error });
    }

    return {
      success: true,
      data: { message: 'Meeting recording cancelled' },
    };
  });

  // Get meeting transcript
  app.get('/:id/transcript', async (request: FastifyRequest<{ Params: { id: string } }>) => {
    await app.requirePermission('meetings.read')(request, {} as never);

    const { id } = request.params;
    const tenantId = request.tenantId!;

    const meeting = await prisma.meeting.findFirst({
      where: { id, tenantId },
      include: { transcript: true },
    });

    if (!meeting) {
      throw new NotFoundError('Meeting', id);
    }

    if (!meeting.transcript) {
      return {
        success: true,
        data: null,
      };
    }

    return {
      success: true,
      data: meeting.transcript,
    };
  });

  // Get meeting insights
  app.get('/:id/insights', async (request: FastifyRequest<{ Params: { id: string } }>) => {
    await app.requirePermission('meetings.read')(request, {} as never);

    const { id } = request.params;
    const tenantId = request.tenantId!;

    const meeting = await prisma.meeting.findFirst({
      where: { id, tenantId },
      include: {
        insights: {
          orderBy: { version: 'desc' },
        },
      },
    });

    if (!meeting) {
      throw new NotFoundError('Meeting', id);
    }

    return {
      success: true,
      data: meeting.insights,
    };
  });

  // Regenerate insights
  app.post('/:id/insights/regenerate', async (request: FastifyRequest<{ Params: { id: string } }>) => {
    await app.requirePermission('meetings.update')(request, {} as never);

    const { id } = request.params;
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const meeting = await prisma.meeting.findFirst({
      where: { id, tenantId },
      include: { transcript: true },
    });

    if (!meeting) {
      throw new NotFoundError('Meeting', id);
    }

    if (!meeting.transcript) {
      throw new Error('No transcript available. Please wait for the meeting to be processed.');
    }

    // Start insights workflow
    await startMeetingInsightsWorkflow({
      meetingId: id,
      tenantId,
      userId,
      regenerate: true,
    });

    return {
      success: true,
      data: { message: 'Insight regeneration started' },
    };
  });

  // Create tasks from meeting insights
  app.post('/:id/create-tasks', async (request: FastifyRequest<{ Params: { id: string } }>) => {
    await app.requirePermission('tasks.create')(request, {} as never);

    const { id } = request.params;
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const meeting = await prisma.meeting.findFirst({
      where: { id, tenantId },
      include: {
        insights: {
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });

    if (!meeting) {
      throw new NotFoundError('Meeting', id);
    }

    const insight = meeting.insights[0];
    if (!insight?.actionItems) {
      return {
        success: true,
        data: { created: 0, message: 'No action items to create tasks from' },
      };
    }

    const actionItems = insight.actionItems as Array<{
      text: string;
      assignee?: string;
      dueDate?: string;
    }>;

    const taskIds: string[] = [];

    for (const item of actionItems) {
      // Check if task already exists for this action item
      const existing = await prisma.task.findFirst({
        where: {
          tenantId,
          source: 'meeting_insight',
          sourceId: id,
          title: item.text,
        },
      });

      if (!existing) {
        const task = await prisma.task.create({
          data: {
            tenantId,
            title: item.text,
            source: 'meeting_insight',
            sourceId: id,
            assigneeId: userId,
            creatorId: userId,
            dueAt: item.dueDate ? new Date(item.dueDate) : undefined,
            priority: 'MEDIUM',
          },
        });
        taskIds.push(task.id);
      }
    }

    return {
      success: true,
      data: { created: taskIds.length, taskIds },
    };
  });

  // Get meeting stats
  app.get('/stats', async (request: FastifyRequest) => {
    await app.requirePermission('meetings.read')(request, {} as never);

    const tenantId = request.tenantId!;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [total, thisWeek, recorded, withInsights] = await Promise.all([
      prisma.meeting.count({ where: { tenantId } }),
      prisma.meeting.count({
        where: { tenantId, createdAt: { gte: weekAgo } },
      }),
      prisma.meeting.count({
        where: { tenantId, status: 'READY' },
      }),
      prisma.meeting.count({
        where: {
          tenantId,
          insights: { some: {} },
        },
      }),
    ]);

    return {
      success: true,
      data: {
        total,
        thisWeek,
        recorded,
        withInsights,
      },
    };
  });
}
