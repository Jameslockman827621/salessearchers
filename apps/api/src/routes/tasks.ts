// ===========================================
// Tasks Routes (Complete Implementation)
// ===========================================

import { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma, Prisma } from '@salessearchers/db';
import type { TaskStatus } from '@salessearchers/db';
import {
  createTaskSchema,
  updateTaskSchema,
  listTasksQuerySchema,
  NotFoundError,
  AUDIT_ACTIONS,
} from '@salessearchers/shared';

export async function tasksRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', app.authenticate);

  // List tasks
  app.get('/', async (request: FastifyRequest) => {
    await app.requirePermission('tasks.read')(request, {} as never);

    const query = listTasksQuerySchema.parse(request.query);
    const tenantId = request.tenantId!;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

    const where: Prisma.TaskWhereInput = {
      tenantId,
      ...(query.status && { status: query.status as TaskStatus }),
      ...(query.assigneeId && { assigneeId: query.assigneeId }),
      ...(query.overdue && {
        dueAt: { lt: now },
        status: { notIn: ['COMPLETED', 'CANCELLED'] as TaskStatus[] },
      }),
    };

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          assignee: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          creator: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          contact: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          deal: {
            select: { id: true, name: true },
          },
        },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [
          { dueAt: 'asc' },
          { priority: 'desc' },
          { createdAt: 'desc' },
        ],
      }),
      prisma.task.count({ where }),
    ]);

    return {
      success: true,
      data: tasks,
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

  // Get task stats
  app.get('/stats', async (request: FastifyRequest) => {
    await app.requirePermission('tasks.read')(request, {} as never);

    const tenantId = request.tenantId!;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [overdue, dueToday, pending, completedThisWeek] = await Promise.all([
      prisma.task.count({
        where: {
          tenantId,
          dueAt: { lt: now },
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
      }),
      prisma.task.count({
        where: {
          tenantId,
          dueAt: { gte: startOfToday, lt: endOfToday },
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
      }),
      prisma.task.count({
        where: {
          tenantId,
          status: 'PENDING',
        },
      }),
      prisma.task.count({
        where: {
          tenantId,
          status: 'COMPLETED',
          completedAt: { gte: weekAgo },
        },
      }),
    ]);

    return {
      success: true,
      data: {
        overdue,
        dueToday,
        pending,
        completedThisWeek,
      },
    };
  });

  // Get task by ID
  app.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>) => {
    await app.requirePermission('tasks.read')(request, {} as never);

    const { id } = request.params;
    const tenantId = request.tenantId!;

    const task = await prisma.task.findFirst({
      where: { id, tenantId },
      include: {
        assignee: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        creator: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        contact: true,
        deal: true,
      },
    });

    if (!task) {
      throw new NotFoundError('Task', id);
    }

    return {
      success: true,
      data: task,
    };
  });

  // Create task
  app.post('/', async (request: FastifyRequest) => {
    await app.requirePermission('tasks.create')(request, {} as never);

    const body = createTaskSchema.parse(request.body);
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const task = await prisma.task.create({
      data: {
        tenantId,
        title: body.title,
        description: body.description,
        priority: body.priority ?? 'MEDIUM',
        dueAt: body.dueAt,
        assigneeId: body.assigneeId ?? userId,
        creatorId: userId,
        contactId: body.contactId,
        dealId: body.dealId,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: AUDIT_ACTIONS.TASK_CREATED,
        resource: 'task',
        resourceId: task.id,
        details: { title: task.title, priority: task.priority },
      },
    });

    return {
      success: true,
      data: task,
    };
  });

  // Update task
  app.patch('/:id', async (request: FastifyRequest<{ Params: { id: string } }>) => {
    await app.requirePermission('tasks.update')(request, {} as never);

    const { id } = request.params;
    const body = updateTaskSchema.parse(request.body);
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const existing = await prisma.task.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundError('Task', id);
    }

    const updateData: Parameters<typeof prisma.task.update>[0]['data'] = {
      ...body,
      ...(body.status === 'COMPLETED' && !existing.completedAt && {
        completedAt: new Date(),
      }),
      ...(body.status && body.status !== 'COMPLETED' && existing.completedAt && {
        completedAt: null,
      }),
    };

    const task = await prisma.task.update({
      where: { id },
      data: updateData,
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: AUDIT_ACTIONS.TASK_UPDATED,
        resource: 'task',
        resourceId: task.id,
        details: { changes: body },
      },
    });

    return {
      success: true,
      data: task,
    };
  });

  // Delete task
  app.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>) => {
    await app.requirePermission('tasks.delete')(request, {} as never);

    const { id } = request.params;
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const task = await prisma.task.findFirst({
      where: { id, tenantId },
    });

    if (!task) {
      throw new NotFoundError('Task', id);
    }

    await prisma.task.delete({ where: { id } });

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: AUDIT_ACTIONS.TASK_DELETED,
        resource: 'task',
        resourceId: id,
        details: { title: task.title },
      },
    });

    return {
      success: true,
      data: { message: 'Task deleted' },
    };
  });

  // Bulk update task status
  app.post('/bulk/status', async (request: FastifyRequest) => {
    await app.requirePermission('tasks.update')(request, {} as never);

    const { ids, status } = request.body as { ids: string[]; status: TaskStatus };
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const result = await prisma.task.updateMany({
      where: { id: { in: ids }, tenantId },
      data: {
        status: status as TaskStatus,
        ...(status === 'COMPLETED' && { completedAt: new Date() }),
        ...(status !== 'COMPLETED' && { completedAt: null }),
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: AUDIT_ACTIONS.TASK_UPDATED,
        resource: 'task',
        resourceId: ids.join(','),
        details: { status, count: result.count },
      },
    });

    return {
      success: true,
      data: { updated: result.count },
    };
  });
}
