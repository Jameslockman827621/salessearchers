// ===========================================
// Data Rooms API Routes
// ===========================================

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@salessearchers/db';
import { logger } from '@salessearchers/shared';
import crypto from 'crypto';

// ===========================================
// Schemas
// ===========================================

const createDataRoomSchema = z.object({
  name: z.string().min(1).max(200),
  dealId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  description: z.string().optional(),
  welcomeMessage: z.string().optional(),
  primaryColor: z.string().max(20).optional(),
  isPasswordProtected: z.boolean().default(false),
  password: z.string().min(6).optional(),
  expiresAt: z.string().datetime().optional(),
});

const updateDataRoomSchema = createDataRoomSchema.partial().extend({
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  settings: z.record(z.unknown()).optional(),
});

const createSectionSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  order: z.number().int().optional(),
});

const createContentSchema = z.object({
  sectionId: z.string().uuid().optional(),
  type: z.enum(['FILE', 'LINK', 'VIDEO', 'EMBED', 'TEXT', 'IMAGE', 'PDF']),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  order: z.number().int().optional(),
  url: z.string().url().optional(),
  embedCode: z.string().optional(),
  content: z.string().optional(),
  isRequired: z.boolean().default(false),
});

const createActionItemSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  assignedTo: z.string().optional(),
  order: z.number().int().optional(),
});

const recordViewSchema = z.object({
  visitorEmail: z.string().email().optional(),
  visitorName: z.string().optional(),
  contentId: z.string().uuid().optional(),
  timeSpent: z.number().int().min(0).optional(),
});

// ===========================================
// Helper Functions
// ===========================================

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
  const random = crypto.randomBytes(4).toString('hex');
  return `${base}-${random}`;
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// ===========================================
// Routes
// ===========================================

export const dataRoomsRoutes: FastifyPluginAsync = async (fastify) => {
  // ===========================================
  // Data Room CRUD
  // ===========================================

  // List data rooms
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;

    const querySchema = z.object({
      dealId: z.string().uuid().optional(),
      contactId: z.string().uuid().optional(),
      status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
    });
    const query = querySchema.parse(request.query);

    const where: Prisma.DataRoomWhereInput = {
      tenantId,
    };

    if (query.dealId) where.dealId = query.dealId;
    if (query.contactId) where.contactId = query.contactId;
    if (query.status) where.status = query.status;

    const dataRooms = await prisma.dataRoom.findMany({
      where,
      include: {
        deal: { select: { id: true, name: true } },
        contact: { select: { id: true, email: true, firstName: true, lastName: true } },
        _count: { select: { contents: true, views: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return reply.send({ success: true, data: dataRooms });
  });

  // Get single data room
  fastify.get<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;

    const dataRoom = await prisma.dataRoom.findFirst({
      where: { id, tenantId },
      include: {
        deal: { select: { id: true, name: true, value: true } },
        contact: { select: { id: true, email: true, firstName: true, lastName: true } },
        sections: {
          orderBy: { order: 'asc' },
          include: {
            contents: {
              where: { isHidden: false },
              orderBy: { order: 'asc' },
            },
          },
        },
        contents: {
          where: { sectionId: null, isHidden: false },
          orderBy: { order: 'asc' },
        },
        actionItems: {
          orderBy: { order: 'asc' },
        },
        views: {
          orderBy: { viewedAt: 'desc' },
          take: 20,
          include: {
            contact: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!dataRoom) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Data room not found' },
      });
    }

    return reply.send({ success: true, data: dataRoom });
  });

  // Create data room
  fastify.post('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const data = createDataRoomSchema.parse(request.body);
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    // Generate unique slug
    let slug = generateSlug(data.name);
    let slugExists = await prisma.dataRoom.findFirst({
      where: { tenantId, slug },
    });
    while (slugExists) {
      slug = generateSlug(data.name);
      slugExists = await prisma.dataRoom.findFirst({
        where: { tenantId, slug },
      });
    }

    const dataRoom = await prisma.dataRoom.create({
      data: {
        tenantId,
        name: data.name,
        slug,
        dealId: data.dealId,
        contactId: data.contactId,
        description: data.description,
        welcomeMessage: data.welcomeMessage,
        primaryColor: data.primaryColor,
        isPasswordProtected: data.isPasswordProtected,
        password: data.password ? hashPassword(data.password) : null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        createdById: userId,
        status: 'DRAFT',
      },
    });

    // Log activity
    await prisma.activity.create({
      data: {
        tenantId,
        userId,
        dealId: data.dealId,
        contactId: data.contactId,
        dataRoomId: dataRoom.id,
        type: 'data_room_created',
        title: 'Data room created',
        description: dataRoom.name,
      },
    });

    logger.info('Data room created', { context: 'data-rooms', dataRoomId: dataRoom.id });

    return reply.status(201).send({
      success: true,
      data: { id: dataRoom.id, slug: dataRoom.slug },
    });
  });

  // Update data room
  fastify.put<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const data = updateDataRoomSchema.parse(request.body);
    const tenantId = request.tenantId!;

    const existing = await prisma.dataRoom.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Data room not found' },
      });
    }

    const updateData: Prisma.DataRoomUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.welcomeMessage !== undefined) updateData.welcomeMessage = data.welcomeMessage;
    if (data.primaryColor !== undefined) updateData.primaryColor = data.primaryColor;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.settings !== undefined) updateData.settings = data.settings as Prisma.InputJsonValue;
    if (data.isPasswordProtected !== undefined) updateData.isPasswordProtected = data.isPasswordProtected;
    if (data.password !== undefined) updateData.password = hashPassword(data.password);
    if (data.expiresAt !== undefined) updateData.expiresAt = new Date(data.expiresAt);

    const dataRoom = await prisma.dataRoom.update({
      where: { id },
      data: updateData,
    });

    logger.info('Data room updated', { context: 'data-rooms', dataRoomId: id });

    return reply.send({ success: true, data: { id: dataRoom.id } });
  });

  // Delete data room
  fastify.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;

    const dataRoom = await prisma.dataRoom.findFirst({
      where: { id, tenantId },
    });

    if (!dataRoom) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Data room not found' },
      });
    }

    await prisma.dataRoom.delete({ where: { id } });

    logger.info('Data room deleted', { context: 'data-rooms', dataRoomId: id });

    return reply.send({ success: true, data: { message: 'Data room deleted' } });
  });

  // ===========================================
  // Sections
  // ===========================================

  // Create section
  fastify.post<{ Params: { id: string } }>('/:id/sections', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const data = createSectionSchema.parse(request.body);
    const tenantId = request.tenantId!;

    const dataRoom = await prisma.dataRoom.findFirst({
      where: { id, tenantId },
    });

    if (!dataRoom) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Data room not found' },
      });
    }

    // Determine order if not provided
    let order = data.order;
    if (order === undefined) {
      const maxOrder = await prisma.dataRoomSection.aggregate({
        where: { dataRoomId: id },
        _max: { order: true },
      });
      order = (maxOrder._max.order ?? -1) + 1;
    }

    const section = await prisma.dataRoomSection.create({
      data: {
        dataRoomId: id,
        name: data.name,
        description: data.description,
        order,
      },
    });

    return reply.status(201).send({ success: true, data: { id: section.id } });
  });

  // Update section
  fastify.put<{ Params: { id: string; sectionId: string } }>('/:id/sections/:sectionId', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id, sectionId } = request.params;
    const data = createSectionSchema.partial().parse(request.body);
    const tenantId = request.tenantId!;

    const dataRoom = await prisma.dataRoom.findFirst({
      where: { id, tenantId },
    });

    if (!dataRoom) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Data room not found' },
      });
    }

    const section = await prisma.dataRoomSection.update({
      where: { id: sectionId },
      data,
    });

    return reply.send({ success: true, data: { id: section.id } });
  });

  // Delete section
  fastify.delete<{ Params: { id: string; sectionId: string } }>('/:id/sections/:sectionId', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id, sectionId } = request.params;
    const tenantId = request.tenantId!;

    const dataRoom = await prisma.dataRoom.findFirst({
      where: { id, tenantId },
    });

    if (!dataRoom) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Data room not found' },
      });
    }

    await prisma.dataRoomSection.delete({ where: { id: sectionId } });

    return reply.send({ success: true, data: { message: 'Section deleted' } });
  });

  // ===========================================
  // Content
  // ===========================================

  // Add content
  fastify.post<{ Params: { id: string } }>('/:id/contents', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const data = createContentSchema.parse(request.body);
    const tenantId = request.tenantId!;

    const dataRoom = await prisma.dataRoom.findFirst({
      where: { id, tenantId },
    });

    if (!dataRoom) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Data room not found' },
      });
    }

    // Determine order if not provided
    let order = data.order;
    if (order === undefined) {
      const maxOrder = await prisma.dataRoomContent.aggregate({
        where: { dataRoomId: id, sectionId: data.sectionId ?? null },
        _max: { order: true },
      });
      order = (maxOrder._max.order ?? -1) + 1;
    }

    const content = await prisma.dataRoomContent.create({
      data: {
        dataRoomId: id,
        sectionId: data.sectionId,
        type: data.type,
        name: data.name,
        description: data.description,
        order,
        url: data.url,
        embedCode: data.embedCode,
        content: data.content,
        isRequired: data.isRequired,
      },
    });

    return reply.status(201).send({ success: true, data: { id: content.id } });
  });

  // Update content
  fastify.put<{ Params: { id: string; contentId: string } }>('/:id/contents/:contentId', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id, contentId } = request.params;
    const data = createContentSchema.partial().parse(request.body);
    const tenantId = request.tenantId!;

    const dataRoom = await prisma.dataRoom.findFirst({
      where: { id, tenantId },
    });

    if (!dataRoom) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Data room not found' },
      });
    }

    const content = await prisma.dataRoomContent.update({
      where: { id: contentId },
      data,
    });

    return reply.send({ success: true, data: { id: content.id } });
  });

  // Delete content
  fastify.delete<{ Params: { id: string; contentId: string } }>('/:id/contents/:contentId', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id, contentId } = request.params;
    const tenantId = request.tenantId!;

    const dataRoom = await prisma.dataRoom.findFirst({
      where: { id, tenantId },
    });

    if (!dataRoom) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Data room not found' },
      });
    }

    await prisma.dataRoomContent.delete({ where: { id: contentId } });

    return reply.send({ success: true, data: { message: 'Content deleted' } });
  });

  // ===========================================
  // Action Items (Mutual Action Plan)
  // ===========================================

  // Add action item
  fastify.post<{ Params: { id: string } }>('/:id/action-items', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const data = createActionItemSchema.parse(request.body);
    const tenantId = request.tenantId!;

    const dataRoom = await prisma.dataRoom.findFirst({
      where: { id, tenantId },
    });

    if (!dataRoom) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Data room not found' },
      });
    }

    // Determine order
    let order = data.order;
    if (order === undefined) {
      const maxOrder = await prisma.dataRoomActionItem.aggregate({
        where: { dataRoomId: id },
        _max: { order: true },
      });
      order = (maxOrder._max.order ?? -1) + 1;
    }

    const actionItem = await prisma.dataRoomActionItem.create({
      data: {
        dataRoomId: id,
        title: data.title,
        description: data.description,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        assignedTo: data.assignedTo,
        order,
      },
    });

    return reply.status(201).send({ success: true, data: { id: actionItem.id } });
  });

  // Toggle action item completion
  fastify.put<{ Params: { id: string; itemId: string } }>('/:id/action-items/:itemId/toggle', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id, itemId } = request.params;
    const tenantId = request.tenantId!;

    const dataRoom = await prisma.dataRoom.findFirst({
      where: { id, tenantId },
    });

    if (!dataRoom) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Data room not found' },
      });
    }

    const item = await prisma.dataRoomActionItem.findFirst({
      where: { id: itemId, dataRoomId: id },
    });

    if (!item) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Action item not found' },
      });
    }

    const updated = await prisma.dataRoomActionItem.update({
      where: { id: itemId },
      data: {
        isCompleted: !item.isCompleted,
        completedAt: item.isCompleted ? null : new Date(),
      },
    });

    return reply.send({
      success: true,
      data: { id: updated.id, isCompleted: updated.isCompleted },
    });
  });

  // Delete action item
  fastify.delete<{ Params: { id: string; itemId: string } }>('/:id/action-items/:itemId', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id, itemId } = request.params;
    const tenantId = request.tenantId!;

    const dataRoom = await prisma.dataRoom.findFirst({
      where: { id, tenantId },
    });

    if (!dataRoom) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Data room not found' },
      });
    }

    await prisma.dataRoomActionItem.delete({ where: { id: itemId } });

    return reply.send({ success: true, data: { message: 'Action item deleted' } });
  });

  // ===========================================
  // Public View & Analytics
  // ===========================================

  // Get public data room by slug (no auth required)
  fastify.get<{ Params: { slug: string } }>('/public/:slug', async (request, reply) => {
    const { slug } = request.params;

    const dataRoom = await prisma.dataRoom.findFirst({
      where: {
        slug,
        status: 'ACTIVE',
        isPublic: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      include: {
        sections: {
          orderBy: { order: 'asc' },
          include: {
            contents: {
              where: { isHidden: false },
              orderBy: { order: 'asc' },
              select: {
                id: true,
                type: true,
                name: true,
                description: true,
                url: true,
                embedCode: true,
                content: true,
                thumbnailUrl: true,
                isRequired: true,
              },
            },
          },
        },
        contents: {
          where: { sectionId: null, isHidden: false },
          orderBy: { order: 'asc' },
          select: {
            id: true,
            type: true,
            name: true,
            description: true,
            url: true,
            embedCode: true,
            content: true,
            thumbnailUrl: true,
            isRequired: true,
          },
        },
        actionItems: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            title: true,
            description: true,
            dueDate: true,
            assignedTo: true,
            isCompleted: true,
          },
        },
      },
    });

    if (!dataRoom) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Data room not found or expired' },
      });
    }

    // Check password if protected
    if (dataRoom.isPasswordProtected) {
      const passwordHeader = request.headers['x-data-room-password'] as string;
      if (!passwordHeader || hashPassword(passwordHeader) !== dataRoom.password) {
        return reply.status(401).send({
          success: false,
          error: { code: 'PASSWORD_REQUIRED', message: 'Password required' },
          data: { passwordRequired: true },
        });
      }
    }

    // Return public view (hide sensitive data)
    return reply.send({
      success: true,
      data: {
        id: dataRoom.id,
        name: dataRoom.name,
        description: dataRoom.description,
        welcomeMessage: dataRoom.welcomeMessage,
        logoUrl: dataRoom.logoUrl,
        bannerUrl: dataRoom.bannerUrl,
        primaryColor: dataRoom.primaryColor,
        sections: dataRoom.sections,
        contents: dataRoom.contents,
        actionItems: dataRoom.actionItems,
      },
    });
  });

  // Record view/analytics
  fastify.post<{ Params: { slug: string } }>('/public/:slug/view', async (request, reply) => {
    const { slug } = request.params;
    const data = recordViewSchema.parse(request.body);

    const dataRoom = await prisma.dataRoom.findFirst({
      where: { slug, status: 'ACTIVE' },
    });

    if (!dataRoom) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Data room not found' },
      });
    }

    // Find or create contact if email provided
    let contactId: string | null = null;
    if (data.visitorEmail) {
      const contact = await prisma.contact.findFirst({
        where: { tenantId: dataRoom.tenantId, email: data.visitorEmail },
      });
      if (contact) {
        contactId = contact.id;
      }
    }

    // Create view record
    const view = await prisma.dataRoomView.create({
      data: {
        dataRoomId: dataRoom.id,
        contactId,
        visitorEmail: data.visitorEmail,
        visitorName: data.visitorName,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        referrer: request.headers['referer'],
        timeSpent: data.timeSpent ?? 0,
      },
    });

    // Update data room analytics
    await prisma.dataRoom.update({
      where: { id: dataRoom.id },
      data: {
        totalViews: { increment: 1 },
        lastViewedAt: new Date(),
      },
    });

    // Record content view if provided
    if (data.contentId) {
      await prisma.dataRoomContentView.create({
        data: {
          viewId: view.id,
          contentId: data.contentId,
          timeSpent: data.timeSpent ?? 0,
        },
      });

      await prisma.dataRoomContent.update({
        where: { id: data.contentId },
        data: { viewCount: { increment: 1 } },
      });
    }

    // Log activity
    await prisma.activity.create({
      data: {
        tenantId: dataRoom.tenantId,
        contactId,
        dataRoomId: dataRoom.id,
        type: 'data_room_viewed',
        title: 'Data room viewed',
        description: data.visitorEmail ?? 'Anonymous visitor',
        metadata: {
          visitorEmail: data.visitorEmail,
          visitorName: data.visitorName,
        } as Prisma.InputJsonValue,
      },
    });

    return reply.send({ success: true, data: { viewId: view.id } });
  });

  // Get data room analytics
  fastify.get<{ Params: { id: string } }>('/:id/analytics', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;

    const dataRoom = await prisma.dataRoom.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        totalViews: true,
        uniqueVisitors: true,
        totalTimeSpent: true,
        lastViewedAt: true,
      },
    });

    if (!dataRoom) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Data room not found' },
      });
    }

    // Get content analytics
    const contentStats = await prisma.dataRoomContent.findMany({
      where: { dataRoomId: id },
      select: {
        id: true,
        name: true,
        type: true,
        viewCount: true,
        downloadCount: true,
        avgTimeSpent: true,
      },
      orderBy: { viewCount: 'desc' },
    });

    // Get recent views
    const recentViews = await prisma.dataRoomView.findMany({
      where: { dataRoomId: id },
      orderBy: { viewedAt: 'desc' },
      take: 50,
      include: {
        contact: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    // Get unique visitors count
    const uniqueEmails = await prisma.dataRoomView.groupBy({
      by: ['visitorEmail'],
      where: { dataRoomId: id, visitorEmail: { not: null } },
    });

    return reply.send({
      success: true,
      data: {
        ...dataRoom,
        uniqueVisitors: uniqueEmails.length,
        contentStats,
        recentViews,
      },
    });
  });
};

