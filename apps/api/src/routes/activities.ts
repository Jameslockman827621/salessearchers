// ===========================================
// Activity Timeline API Routes
// ===========================================

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@salessearchers/db';

// ===========================================
// Schemas
// ===========================================

const createActivitySchema = z.object({
  contactId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  dealId: z.string().uuid().optional(),
  dataRoomId: z.string().uuid().optional(),
  type: z.string().min(1).max(50),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  occurredAt: z.string().datetime().optional(),
});

// ===========================================
// Routes
// ===========================================

export const activitiesRoutes: FastifyPluginAsync = async (fastify) => {
  // ===========================================
  // Activity Timeline
  // ===========================================

  // Get global activity feed
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;

    const querySchema = z.object({
      contactId: z.string().uuid().optional(),
      companyId: z.string().uuid().optional(),
      dealId: z.string().uuid().optional(),
      dataRoomId: z.string().uuid().optional(),
      type: z.string().optional(),
      limit: z.coerce.number().min(1).max(100).default(50),
      offset: z.coerce.number().min(0).default(0),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
    });
    const query = querySchema.parse(request.query);

    const where: Prisma.ActivityWhereInput = {
      tenantId,
    };

    if (query.contactId) where.contactId = query.contactId;
    if (query.companyId) where.companyId = query.companyId;
    if (query.dealId) where.dealId = query.dealId;
    if (query.dataRoomId) where.dataRoomId = query.dataRoomId;
    if (query.type) where.type = query.type;

    if (query.startDate || query.endDate) {
      where.occurredAt = {};
      if (query.startDate) where.occurredAt.gte = new Date(query.startDate);
      if (query.endDate) where.occurredAt.lte = new Date(query.endDate);
    }

    const [activities, total] = await Promise.all([
      prisma.activity.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          contact: { select: { id: true, email: true, firstName: true, lastName: true } },
          company: { select: { id: true, name: true } },
          deal: { select: { id: true, name: true } },
          dataRoom: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { occurredAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      prisma.activity.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: activities,
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
      },
    });
  });

  // Get activity types for filtering
  fastify.get('/types', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;

    const types = await prisma.activity.groupBy({
      by: ['type'],
      where: { tenantId },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    return reply.send({
      success: true,
      data: types.map((t) => ({
        type: t.type,
        count: t._count.id,
        label: formatActivityType(t.type),
      })),
    });
  });

  // Get contact timeline
  fastify.get<{ Params: { contactId: string } }>('/contact/:contactId', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { contactId } = request.params;
    const tenantId = request.tenantId!;

    const querySchema = z.object({
      limit: z.coerce.number().min(1).max(100).default(50),
      offset: z.coerce.number().min(0).default(0),
    });
    const query = querySchema.parse(request.query);

    // Verify contact exists
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, tenantId },
    });

    if (!contact) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Contact not found' },
      });
    }

    const [activities, total] = await Promise.all([
      prisma.activity.findMany({
        where: { tenantId, contactId },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          deal: { select: { id: true, name: true } },
          dataRoom: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { occurredAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      prisma.activity.count({ where: { tenantId, contactId } }),
    ]);

    return reply.send({
      success: true,
      data: activities,
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
      },
    });
  });

  // Get deal timeline
  fastify.get<{ Params: { dealId: string } }>('/deal/:dealId', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { dealId } = request.params;
    const tenantId = request.tenantId!;

    const querySchema = z.object({
      limit: z.coerce.number().min(1).max(100).default(50),
      offset: z.coerce.number().min(0).default(0),
    });
    const query = querySchema.parse(request.query);

    // Verify deal exists
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, tenantId },
    });

    if (!deal) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Deal not found' },
      });
    }

    const [activities, total] = await Promise.all([
      prisma.activity.findMany({
        where: { tenantId, dealId },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          contact: { select: { id: true, email: true, firstName: true, lastName: true } },
          dataRoom: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { occurredAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      prisma.activity.count({ where: { tenantId, dealId } }),
    ]);

    return reply.send({
      success: true,
      data: activities,
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
      },
    });
  });

  // Get company timeline
  fastify.get<{ Params: { companyId: string } }>('/company/:companyId', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { companyId } = request.params;
    const tenantId = request.tenantId!;

    const querySchema = z.object({
      limit: z.coerce.number().min(1).max(100).default(50),
      offset: z.coerce.number().min(0).default(0),
    });
    const query = querySchema.parse(request.query);

    // Verify company exists
    const company = await prisma.company.findFirst({
      where: { id: companyId, tenantId },
    });

    if (!company) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Company not found' },
      });
    }

    const [activities, total] = await Promise.all([
      prisma.activity.findMany({
        where: { tenantId, companyId },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          contact: { select: { id: true, email: true, firstName: true, lastName: true } },
          deal: { select: { id: true, name: true } },
        },
        orderBy: { occurredAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      prisma.activity.count({ where: { tenantId, companyId } }),
    ]);

    return reply.send({
      success: true,
      data: activities,
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
      },
    });
  });

  // Create activity manually
  fastify.post('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const data = createActivitySchema.parse(request.body);
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const activity = await prisma.activity.create({
      data: {
        tenantId,
        userId,
        contactId: data.contactId,
        companyId: data.companyId,
        dealId: data.dealId,
        dataRoomId: data.dataRoomId,
        type: data.type,
        title: data.title,
        description: data.description,
        metadata: data.metadata as Prisma.InputJsonValue,
        occurredAt: data.occurredAt ? new Date(data.occurredAt) : new Date(),
      },
    });

    return reply.status(201).send({ success: true, data: { id: activity.id } });
  });

  // Get activity summary/stats
  fastify.get('/summary', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;

    const querySchema = z.object({
      days: z.coerce.number().min(1).max(365).default(30),
    });
    const query = querySchema.parse(request.query);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - query.days);

    // Get activity counts by type
    const byType = await prisma.activity.groupBy({
      by: ['type'],
      where: { tenantId, occurredAt: { gte: startDate } },
      _count: { id: true },
    });

    // Get daily activity counts
    const dailyActivities = await prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
      SELECT DATE("occurredAt") as date, COUNT(*) as count
      FROM "Activity"
      WHERE "tenantId" = ${tenantId}
        AND "occurredAt" >= ${startDate}
      GROUP BY DATE("occurredAt")
      ORDER BY date ASC
    `;

    // Get most active contacts
    const topContacts = await prisma.activity.groupBy({
      by: ['contactId'],
      where: { tenantId, occurredAt: { gte: startDate }, contactId: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });

    const contactIds = topContacts.map((c) => c.contactId).filter(Boolean) as string[];
    const contacts = await prisma.contact.findMany({
      where: { id: { in: contactIds } },
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    const contactMap = new Map(contacts.map((c) => [c.id, c]));

    return reply.send({
      success: true,
      data: {
        totalActivities: byType.reduce((sum, t) => sum + t._count.id, 0),
        byType: byType.reduce((acc, item) => ({
          ...acc,
          [item.type]: item._count.id,
        }), {}),
        dailyActivities: dailyActivities.map((d) => ({
          date: d.date,
          count: Number(d.count),
        })),
        topContacts: topContacts.map((c) => ({
          contact: contactMap.get(c.contactId!),
          activityCount: c._count.id,
        })),
      },
    });
  });
};

// ===========================================
// Helper Functions
// ===========================================

function formatActivityType(type: string): string {
  const typeMap: Record<string, string> = {
    email_sent: 'Email Sent',
    email_opened: 'Email Opened',
    email_clicked: 'Link Clicked',
    email_replied: 'Email Reply',
    email_bounced: 'Email Bounced',
    meeting_scheduled: 'Meeting Scheduled',
    meeting_held: 'Meeting Held',
    meeting_cancelled: 'Meeting Cancelled',
    call_made: 'Call Made',
    call_received: 'Call Received',
    task_created: 'Task Created',
    task_completed: 'Task Completed',
    deal_created: 'Deal Created',
    deal_stage_changed: 'Deal Stage Changed',
    deal_won: 'Deal Won',
    deal_lost: 'Deal Lost',
    note_added: 'Note Added',
    contact_created: 'Contact Created',
    contact_updated: 'Contact Updated',
    linkedin_profile_view: 'LinkedIn Profile View',
    linkedin_connection_request: 'Connection Request',
    linkedin_message: 'LinkedIn Message',
    data_room_created: 'Data Room Created',
    data_room_viewed: 'Data Room Viewed',
    data_room_content_downloaded: 'Content Downloaded',
  };

  return typeMap[type] ?? type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

