// ===========================================
// Notifications API Routes
// ===========================================

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@salessearchers/db';
import { logger } from '@salessearchers/shared';

// ===========================================
// Routes
// ===========================================

export const notificationsRoutes: FastifyPluginAsync = async (fastify) => {
  // ===========================================
  // Get notifications
  // ===========================================

  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const querySchema = z.object({
      unreadOnly: z.coerce.boolean().default(false),
      limit: z.coerce.number().min(1).max(100).default(50),
      offset: z.coerce.number().min(0).default(0),
    });
    const query = querySchema.parse(request.query);

    const where: Prisma.NotificationWhereInput = {
      tenantId,
      userId,
      isArchived: false,
    };

    if (query.unreadOnly) {
      where.isRead = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: { tenantId, userId, isRead: false, isArchived: false },
      }),
    ]);

    return reply.send({
      success: true,
      data: notifications,
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
      },
      unreadCount,
    });
  });

  // ===========================================
  // Get unread count
  // ===========================================

  fastify.get('/unread-count', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const count = await prisma.notification.count({
      where: { tenantId, userId, isRead: false, isArchived: false },
    });

    return reply.send({ success: true, data: { count } });
  });

  // ===========================================
  // Mark as read
  // ===========================================

  fastify.put<{ Params: { id: string } }>('/:id/read', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const notification = await prisma.notification.findFirst({
      where: { id, tenantId, userId },
    });

    if (!notification) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Notification not found' },
      });
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });

    return reply.send({ success: true, data: updated });
  });

  // ===========================================
  // Mark all as read
  // ===========================================

  fastify.put('/read-all', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const result = await prisma.notification.updateMany({
      where: { tenantId, userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    return reply.send({
      success: true,
      data: { updated: result.count },
    });
  });

  // ===========================================
  // Archive notification
  // ===========================================

  fastify.put<{ Params: { id: string } }>('/:id/archive', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const notification = await prisma.notification.findFirst({
      where: { id, tenantId, userId },
    });

    if (!notification) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Notification not found' },
      });
    }

    await prisma.notification.update({
      where: { id },
      data: { isArchived: true },
    });

    return reply.send({ success: true, data: { message: 'Notification archived' } });
  });

  // ===========================================
  // Get notification preferences
  // ===========================================

  fastify.get('/preferences', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.userId!;

    let prefs = await prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!prefs) {
      // Create default preferences
      prefs = await prisma.notificationPreference.create({
        data: { userId },
      });
    }

    return reply.send({ success: true, data: prefs });
  });

  // ===========================================
  // Update notification preferences
  // ===========================================

  fastify.put('/preferences', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.userId!;

    const prefsSchema = z.object({
      emailEnabled: z.boolean().optional(),
      emailMeetingReminders: z.boolean().optional(),
      emailTaskReminders: z.boolean().optional(),
      emailDealUpdates: z.boolean().optional(),
      emailDataRoomViews: z.boolean().optional(),
      emailWeeklyDigest: z.boolean().optional(),
      inAppEnabled: z.boolean().optional(),
      inAppMeetingUpdates: z.boolean().optional(),
      inAppTaskUpdates: z.boolean().optional(),
      inAppDealUpdates: z.boolean().optional(),
      inAppDataRoomViews: z.boolean().optional(),
      quietHoursEnabled: z.boolean().optional(),
      quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    });
    const data = prefsSchema.parse(request.body);

    const prefs = await prisma.notificationPreference.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });

    return reply.send({ success: true, data: prefs });
  });

  // ===========================================
  // Create notification (internal/admin use)
  // ===========================================

  fastify.post('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;

    const createSchema = z.object({
      userId: z.string().uuid(),
      type: z.string(),
      title: z.string().max(200),
      body: z.string().max(1000).optional(),
      resourceType: z.string().optional(),
      resourceId: z.string().uuid().optional(),
      actionUrl: z.string().optional(),
    });
    const data = createSchema.parse(request.body);

    const notification = await prisma.notification.create({
      data: {
        tenantId,
        userId: data.userId,
        type: data.type as any,
        title: data.title,
        body: data.body,
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        actionUrl: data.actionUrl,
      },
    });

    return reply.status(201).send({ success: true, data: notification });
  });
};
