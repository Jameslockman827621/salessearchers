// ===========================================
// User Settings API Routes
// ===========================================

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@salessearchers/db';
import { logger, sha256 } from '@salessearchers/shared';

// ===========================================
// Routes
// ===========================================

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  // ===========================================
  // Get current user profile
  // ===========================================

  fastify.get('/profile', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.userId!;
    const tenantId = request.tenantId!;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        timezone: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }

    const membership = await prisma.membership.findFirst({
      where: { userId, tenantId },
      select: { role: true },
    });

    return reply.send({
      success: true,
      data: {
        ...user,
        role: membership?.role ?? 'MEMBER',
      },
    });
  });

  // ===========================================
  // Update profile
  // ===========================================

  fastify.put('/profile', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.userId!;

    const updateSchema = z.object({
      firstName: z.string().max(100).optional(),
      lastName: z.string().max(100).optional(),
      timezone: z.string().max(50).optional(),
      avatarUrl: z.string().url().optional().nullable(),
    });
    const data = updateSchema.parse(request.body);

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        timezone: data.timezone,
        avatarUrl: data.avatarUrl,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        timezone: true,
      },
    });

    logger.info('User profile updated', { context: 'user', userId });

    return reply.send({ success: true, data: user });
  });

  // ===========================================
  // Change password
  // ===========================================

  fastify.put('/password', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.userId!;

    const passwordSchema = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8).max(100),
    });
    const data = passwordSchema.parse(request.body);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!user || !user.passwordHash) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_PASSWORD', message: 'Current password is incorrect' },
      });
    }

    // Verify current password
    const currentHash = sha256(data.currentPassword);
    if (currentHash !== user.passwordHash) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_PASSWORD', message: 'Current password is incorrect' },
      });
    }

    // Update password
    const newHash = sha256(data.newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    logger.info('User password changed', { context: 'user', userId });

    return reply.send({ success: true, data: { message: 'Password updated successfully' } });
  });

  // ===========================================
  // Get team members (for the current tenant)
  // ===========================================

  fastify.get('/team', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;

    const members = await prisma.membership.findMany({
      where: { tenantId, isActive: true },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            timezone: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return reply.send({
      success: true,
      data: members.map((m) => ({
        userId: m.userId,
        role: m.role,
        isActive: m.isActive,
        user: m.user,
        joinedAt: m.createdAt,
      })),
    });
  });

  // ===========================================
  // Invite team member
  // ===========================================

  fastify.post('/team/invite', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const inviteSchema = z.object({
      email: z.string().email(),
      role: z.enum(['ADMIN', 'MANAGER', 'MEMBER']).default('MEMBER'),
    });
    const data = inviteSchema.parse(request.body);

    // Check if user already exists in tenant
    const existingMember = await prisma.membership.findFirst({
      where: {
        tenantId,
        user: { email: data.email },
      },
    });

    if (existingMember) {
      return reply.status(400).send({
        success: false,
        error: { code: 'ALREADY_MEMBER', message: 'User is already a team member' },
      });
    }

    // Check for existing pending invitation
    const existingInvite = await prisma.teamInvitation.findFirst({
      where: {
        tenantId,
        email: data.email,
        status: 'PENDING',
      },
    });

    if (existingInvite) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVITE_EXISTS', message: 'An invitation has already been sent to this email' },
      });
    }

    // Generate token
    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    const invitation = await prisma.teamInvitation.create({
      data: {
        tenantId,
        email: data.email,
        role: data.role,
        invitedById: userId,
        token,
        expiresAt,
      },
    });

    logger.info('Team invitation created', { context: 'user', email: data.email, tenantId });

    return reply.status(201).send({
      success: true,
      data: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        inviteUrl: `${process.env.CORS_ORIGIN}/auth/accept-invite?token=${token}`,
      },
    });
  });

  // ===========================================
  // Get pending invitations
  // ===========================================

  fastify.get('/team/invitations', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;

    const invitations = await prisma.teamInvitation.findMany({
      where: { tenantId, status: 'PENDING' },
      include: {
        invitedBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({ success: true, data: invitations });
  });

  // ===========================================
  // Revoke invitation
  // ===========================================

  fastify.delete<{ Params: { id: string } }>('/team/invitations/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;

    const invitation = await prisma.teamInvitation.findFirst({
      where: { id, tenantId, status: 'PENDING' },
    });

    if (!invitation) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Invitation not found' },
      });
    }

    await prisma.teamInvitation.update({
      where: { id },
      data: { status: 'REVOKED' },
    });

    return reply.send({ success: true, data: { message: 'Invitation revoked' } });
  });

  // ===========================================
  // Update team member role
  // ===========================================

  fastify.put<{ Params: { userId: string } }>('/team/:userId/role', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { userId: targetUserId } = request.params;
    const tenantId = request.tenantId!;
    const requestingUserId = request.userId!;

    const roleSchema = z.object({
      role: z.enum(['ADMIN', 'MANAGER', 'MEMBER']),
    });
    const data = roleSchema.parse(request.body);

    // Check requester has permission (must be ADMIN or OWNER)
    const requesterMembership = await prisma.membership.findFirst({
      where: { tenantId, userId: requestingUserId },
    });

    if (!requesterMembership || !['ADMIN', 'OWNER'].includes(requesterMembership.role)) {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only admins can update roles' },
      });
    }

    // Update target user's role
    const membership = await prisma.membership.findFirst({
      where: { tenantId, userId: targetUserId },
    });

    if (!membership) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Team member not found' },
      });
    }

    // Can't demote owner
    if (membership.role === 'OWNER') {
      return reply.status(400).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Cannot change owner role' },
      });
    }

    await prisma.membership.update({
      where: { id: membership.id },
      data: { role: data.role },
    });

    logger.info('Team member role updated', { context: 'user', targetUserId, newRole: data.role });

    return reply.send({ success: true, data: { message: 'Role updated' } });
  });

  // ===========================================
  // Remove team member
  // ===========================================

  fastify.delete<{ Params: { userId: string } }>('/team/:userId', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { userId: targetUserId } = request.params;
    const tenantId = request.tenantId!;
    const requestingUserId = request.userId!;

    // Can't remove yourself
    if (targetUserId === requestingUserId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Cannot remove yourself' },
      });
    }

    // Check requester has permission
    const requesterMembership = await prisma.membership.findFirst({
      where: { tenantId, userId: requestingUserId },
    });

    if (!requesterMembership || !['ADMIN', 'OWNER'].includes(requesterMembership.role)) {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only admins can remove members' },
      });
    }

    // Can't remove owner
    const targetMembership = await prisma.membership.findFirst({
      where: { tenantId, userId: targetUserId },
    });

    if (!targetMembership) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Team member not found' },
      });
    }

    if (targetMembership.role === 'OWNER') {
      return reply.status(400).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Cannot remove owner' },
      });
    }

    await prisma.membership.update({
      where: { id: targetMembership.id },
      data: { isActive: false },
    });

    logger.info('Team member removed', { context: 'user', targetUserId, tenantId });

    return reply.send({ success: true, data: { message: 'Team member removed' } });
  });

  // ===========================================
  // Get saved views
  // ===========================================

  fastify.get('/views', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const querySchema = z.object({
      entityType: z.string().optional(),
    });
    const query = querySchema.parse(request.query);

    const views = await prisma.savedView.findMany({
      where: {
        tenantId,
        OR: [
          { userId },
          { isShared: true },
        ],
        ...(query.entityType && { entityType: query.entityType }),
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({ success: true, data: views });
  });

  // ===========================================
  // Create saved view
  // ===========================================

  fastify.post('/views', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const viewSchema = z.object({
      name: z.string().max(100),
      entityType: z.string(),
      filters: z.record(z.unknown()),
      columns: z.array(z.string()).optional(),
      sortBy: z.string().optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
      isDefault: z.boolean().optional(),
      isShared: z.boolean().optional(),
    });
    const data = viewSchema.parse(request.body);

    // If setting as default, unset other defaults
    if (data.isDefault) {
      await prisma.savedView.updateMany({
        where: { tenantId, userId, entityType: data.entityType, isDefault: true },
        data: { isDefault: false },
      });
    }

    const view = await prisma.savedView.create({
      data: {
        tenant: { connect: { id: tenantId } },
        user: { connect: { id: userId } },
        name: data.name,
        entityType: data.entityType,
        filters: data.filters as Prisma.InputJsonValue,
        columns: data.columns as Prisma.InputJsonValue | undefined,
        sortBy: data.sortBy,
        sortOrder: data.sortOrder,
        isDefault: data.isDefault ?? false,
        isShared: data.isShared ?? false,
      },
    });

    return reply.status(201).send({ success: true, data: view });
  });

  // ===========================================
  // Delete saved view
  // ===========================================

  fastify.delete<{ Params: { id: string } }>('/views/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const view = await prisma.savedView.findFirst({
      where: { id, tenantId, userId },
    });

    if (!view) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'View not found' },
      });
    }

    await prisma.savedView.delete({ where: { id } });

    return reply.send({ success: true, data: { message: 'View deleted' } });
  });
};

