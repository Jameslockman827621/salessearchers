// ===========================================
// Notes API Routes
// ===========================================

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@salessearchers/db';
import { logger } from '@salessearchers/shared';

// ===========================================
// Schemas
// ===========================================

const createNoteSchema = z.object({
  entityType: z.enum(['contact', 'company', 'deal', 'meeting']),
  entityId: z.string().uuid(),
  content: z.string().min(1).max(10000),
  isPinned: z.boolean().optional(),
});

const updateNoteSchema = z.object({
  content: z.string().min(1).max(10000).optional(),
  isPinned: z.boolean().optional(),
});

// ===========================================
// Helper: Extract mentions from content
// ===========================================

function extractMentions(content: string, tenantId: string): Prisma.JsonValue {
  const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
  const mentions: Array<{ name: string; userId: string; offset: number }> = [];
  
  let match;
  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push({
      name: match[1],
      userId: match[2],
      offset: match.index,
    });
  }
  
  return mentions;
}

// ===========================================
// Routes
// ===========================================

export const notesRoutes: FastifyPluginAsync = async (fastify) => {
  // ===========================================
  // Get notes for an entity
  // ===========================================

  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;

    const querySchema = z.object({
      entityType: z.enum(['contact', 'company', 'deal', 'meeting']),
      entityId: z.string().uuid(),
      limit: z.coerce.number().min(1).max(100).default(50),
      offset: z.coerce.number().min(0).default(0),
    });
    const query = querySchema.parse(request.query);

    const [notes, total] = await Promise.all([
      prisma.note.findMany({
        where: {
          tenantId,
          entityType: query.entityType,
          entityId: query.entityId,
        },
        include: {
          author: {
            select: { id: true, email: true, firstName: true, lastName: true, avatarUrl: true },
          },
        },
        orderBy: [
          { isPinned: 'desc' },
          { createdAt: 'desc' },
        ],
        take: query.limit,
        skip: query.offset,
      }),
      prisma.note.count({
        where: {
          tenantId,
          entityType: query.entityType,
          entityId: query.entityId,
        },
      }),
    ]);

    return reply.send({
      success: true,
      data: notes,
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
      },
    });
  });

  // ===========================================
  // Get single note
  // ===========================================

  fastify.get<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;

    const note = await prisma.note.findFirst({
      where: { id, tenantId },
      include: {
        author: {
          select: { id: true, email: true, firstName: true, lastName: true, avatarUrl: true },
        },
      },
    });

    if (!note) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Note not found' },
      });
    }

    return reply.send({ success: true, data: note });
  });

  // ===========================================
  // Create note
  // ===========================================

  fastify.post('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const data = createNoteSchema.parse(request.body);
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    // Verify entity exists
    let entityExists = false;
    switch (data.entityType) {
      case 'contact':
        entityExists = !!(await prisma.contact.findFirst({ where: { id: data.entityId, tenantId } }));
        break;
      case 'company':
        entityExists = !!(await prisma.company.findFirst({ where: { id: data.entityId, tenantId } }));
        break;
      case 'deal':
        entityExists = !!(await prisma.deal.findFirst({ where: { id: data.entityId, tenantId } }));
        break;
      case 'meeting':
        entityExists = !!(await prisma.meeting.findFirst({ where: { id: data.entityId, tenantId } }));
        break;
    }

    if (!entityExists) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: `${data.entityType} not found` },
      });
    }

    // Extract mentions
    const mentions = extractMentions(data.content, tenantId);

    const note = await prisma.note.create({
      data: {
        tenant: { connect: { id: tenantId } },
        author: { connect: { id: userId } },
        entityType: data.entityType,
        entityId: data.entityId,
        content: data.content,
        isPinned: data.isPinned ?? false,
        mentions: mentions as Prisma.InputJsonValue,
      },
      include: {
        author: {
          select: { id: true, email: true, firstName: true, lastName: true, avatarUrl: true },
        },
      },
    });

    // Create notifications for mentioned users
    const mentionArray = mentions as Array<{ userId: string }>;
    if (mentionArray.length > 0) {
      await prisma.notification.createMany({
        data: mentionArray.map((m) => ({
          tenantId,
          userId: m.userId,
          type: 'MENTION',
          title: 'You were mentioned in a note',
          body: data.content.substring(0, 200),
          resourceType: data.entityType,
          resourceId: data.entityId,
          actionUrl: `/${data.entityType}s/${data.entityId}`,
        })),
      });
    }

    // Log activity
    await prisma.activity.create({
      data: {
        tenantId,
        userId,
        type: 'note_added',
        title: 'Note added',
        description: data.content.substring(0, 100),
        ...(data.entityType === 'contact' && { contactId: data.entityId }),
        ...(data.entityType === 'company' && { companyId: data.entityId }),
        ...(data.entityType === 'deal' && { dealId: data.entityId }),
      },
    });

    logger.info('Note created', { context: 'notes', noteId: note.id });

    return reply.status(201).send({ success: true, data: note });
  });

  // ===========================================
  // Update note
  // ===========================================

  fastify.put<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const data = updateNoteSchema.parse(request.body);
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const note = await prisma.note.findFirst({
      where: { id, tenantId },
    });

    if (!note) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Note not found' },
      });
    }

    // Only author can edit
    if (note.authorId !== userId) {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You can only edit your own notes' },
      });
    }

    const updateData: Prisma.NoteUpdateInput = {};
    if (data.content !== undefined) {
      updateData.content = data.content;
      updateData.mentions = extractMentions(data.content, tenantId) as Prisma.InputJsonValue;
    }
    if (data.isPinned !== undefined) {
      updateData.isPinned = data.isPinned;
    }

    const updated = await prisma.note.update({
      where: { id },
      data: updateData,
      include: {
        author: {
          select: { id: true, email: true, firstName: true, lastName: true, avatarUrl: true },
        },
      },
    });

    return reply.send({ success: true, data: updated });
  });

  // ===========================================
  // Delete note
  // ===========================================

  fastify.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const note = await prisma.note.findFirst({
      where: { id, tenantId },
    });

    if (!note) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Note not found' },
      });
    }

    // Only author or admin can delete
    if (note.authorId !== userId) {
      const membership = await prisma.membership.findFirst({
        where: { tenantId, userId },
      });
      if (membership?.role !== 'ADMIN' && membership?.role !== 'OWNER') {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You can only delete your own notes' },
        });
      }
    }

    await prisma.note.delete({ where: { id } });

    logger.info('Note deleted', { context: 'notes', noteId: id });

    return reply.send({ success: true, data: { message: 'Note deleted' } });
  });

  // ===========================================
  // Toggle pin
  // ===========================================

  fastify.put<{ Params: { id: string } }>('/:id/pin', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;

    const note = await prisma.note.findFirst({
      where: { id, tenantId },
    });

    if (!note) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Note not found' },
      });
    }

    const updated = await prisma.note.update({
      where: { id },
      data: { isPinned: !note.isPinned },
    });

    return reply.send({
      success: true,
      data: { id: updated.id, isPinned: updated.isPinned },
    });
  });
};

