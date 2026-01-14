// ===========================================
// Users Routes
// ===========================================

import { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '@salessearchers/db';
import { paginationSchema, NotFoundError } from '@salessearchers/shared';
import { z } from 'zod';

const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  timezone: z.string().min(1).max(50).optional(),
});

export async function usersRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', app.authenticate);

  // List users in tenant
  app.get('/', async (request: FastifyRequest) => {
    await app.requirePermission('team.read')(request, {} as never);

    const query = paginationSchema.parse(request.query);
    const tenantId = request.tenantId!;

    const [memberships, total] = await Promise.all([
      prisma.membership.findMany({
        where: { tenantId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
              createdAt: true,
            },
          },
        },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.membership.count({ where: { tenantId } }),
    ]);

    return {
      success: true,
      data: memberships.map((m) => ({
        ...m.user,
        role: m.role,
        isActive: m.isActive,
        membershipId: m.id,
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

  // Get user by ID
  app.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>) => {
    await app.requirePermission('team.read')(request, {} as never);

    const { id } = request.params;
    const tenantId = request.tenantId!;

    const membership = await prisma.membership.findFirst({
      where: { userId: id, tenantId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            createdAt: true,
          },
        },
      },
    });

    if (!membership) {
      throw new NotFoundError('User', id);
    }

    return {
      success: true,
      data: {
        ...membership.user,
        role: membership.role,
        isActive: membership.isActive,
        membershipId: membership.id,
      },
    };
  });

  // Update current user profile
  app.patch('/me', async (request: FastifyRequest) => {
    const body = updateProfileSchema.parse(request.body);
    const userId = request.userId!;

    const user = await prisma.user.update({
      where: { id: userId },
      data: body,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        timezone: true,
      },
    });

    return {
      success: true,
      data: user,
    };
  });
}
