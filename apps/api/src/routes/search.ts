// ===========================================
// Global Search API Routes
// ===========================================

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '@salessearchers/db';

// ===========================================
// Routes
// ===========================================

export const searchRoutes: FastifyPluginAsync = async (fastify) => {
  // ===========================================
  // Global Search
  // ===========================================

  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;

    const querySchema = z.object({
      q: z.string().min(1).max(200),
      types: z.string().optional(), // comma-separated: contacts,companies,deals,meetings,tasks
      limit: z.coerce.number().min(1).max(50).default(10),
    });
    const query = querySchema.parse(request.query);

    const searchTerm = query.q.toLowerCase();
    const types = query.types?.split(',') ?? ['contacts', 'companies', 'deals', 'meetings', 'tasks'];
    const limit = query.limit;

    const results: Array<{
      type: string;
      id: string;
      title: string;
      subtitle?: string;
      avatarUrl?: string | null;
      url: string;
      metadata?: Record<string, unknown>;
    }> = [];

    // Search contacts
    if (types.includes('contacts')) {
      const contacts = await prisma.contact.findMany({
        where: {
          tenantId,
          OR: [
            { email: { contains: searchTerm, mode: 'insensitive' } },
            { firstName: { contains: searchTerm, mode: 'insensitive' } },
            { lastName: { contains: searchTerm, mode: 'insensitive' } },
            { phone: { contains: searchTerm, mode: 'insensitive' } },
          ],
        },
        include: {
          company: { select: { name: true } },
        },
        take: limit,
      });

      results.push(...contacts.map((c) => ({
        type: 'contact',
        id: c.id,
        title: c.firstName ? `${c.firstName} ${c.lastName ?? ''}`.trim() : c.email ?? 'Unknown',
        subtitle: c.company?.name ?? c.title ?? c.email ?? undefined,
        avatarUrl: c.avatarUrl,
        url: `/contacts/${c.id}`,
        metadata: { email: c.email, phone: c.phone },
      })));
    }

    // Search companies
    if (types.includes('companies')) {
      const companies = await prisma.company.findMany({
        where: {
          tenantId,
          OR: [
            { name: { contains: searchTerm, mode: 'insensitive' } },
            { domain: { contains: searchTerm, mode: 'insensitive' } },
            { industry: { contains: searchTerm, mode: 'insensitive' } },
          ],
        },
        take: limit,
      });

      results.push(...companies.map((c) => ({
        type: 'company',
        id: c.id,
        title: c.name,
        subtitle: c.industry ?? c.domain ?? undefined,
        avatarUrl: c.logoUrl,
        url: `/companies/${c.id}`,
        metadata: { domain: c.domain, industry: c.industry },
      })));
    }

    // Search deals
    if (types.includes('deals')) {
      const deals = await prisma.deal.findMany({
        where: {
          tenantId,
          OR: [
            { name: { contains: searchTerm, mode: 'insensitive' } },
            { notes: { contains: searchTerm, mode: 'insensitive' } },
          ],
        },
        include: {
          stage: { select: { name: true, color: true } },
          company: { select: { name: true } },
        },
        take: limit,
      });

      results.push(...deals.map((d) => ({
        type: 'deal',
        id: d.id,
        title: d.name,
        subtitle: d.company?.name ?? d.stage?.name ?? undefined,
        url: `/pipeline?deal=${d.id}`,
        metadata: { value: d.value, stage: d.stage?.name },
      })));
    }

    // Search meetings
    if (types.includes('meetings')) {
      const meetings = await prisma.meeting.findMany({
        where: {
          tenantId,
          title: { contains: searchTerm, mode: 'insensitive' },
        },
        include: {
          user: { select: { email: true, firstName: true, lastName: true } },
        },
        take: limit,
      });

      results.push(...meetings.map((m) => ({
        type: 'meeting',
        id: m.id,
        title: m.title ?? 'Untitled Meeting',
        subtitle: m.scheduledAt?.toLocaleDateString() ?? undefined,
        url: `/meetings/${m.id}`,
        metadata: { status: m.status, platform: m.platform },
      })));
    }

    // Search tasks
    if (types.includes('tasks')) {
      const tasks = await prisma.task.findMany({
        where: {
          tenantId,
          OR: [
            { title: { contains: searchTerm, mode: 'insensitive' } },
            { description: { contains: searchTerm, mode: 'insensitive' } },
          ],
        },
        include: {
          assignee: { select: { email: true, firstName: true, lastName: true } },
        },
        take: limit,
      });

      results.push(...tasks.map((t) => ({
        type: 'task',
        id: t.id,
        title: t.title,
        subtitle: t.assignee?.firstName ?? t.assignee?.email ?? undefined,
        url: `/tasks?id=${t.id}`,
        metadata: { status: t.status, priority: t.priority },
      })));
    }

    // Search data rooms
    if (types.includes('data_rooms')) {
      const dataRooms = await prisma.dataRoom.findMany({
        where: {
          tenantId,
          OR: [
            { name: { contains: searchTerm, mode: 'insensitive' } },
            { description: { contains: searchTerm, mode: 'insensitive' } },
          ],
        },
        take: limit,
      });

      results.push(...dataRooms.map((dr) => ({
        type: 'data_room',
        id: dr.id,
        title: dr.name,
        subtitle: dr.description ?? undefined,
        url: `/data-rooms/${dr.id}`,
        metadata: { status: dr.status, slug: dr.slug },
      })));
    }

    // Search sequences
    if (types.includes('sequences')) {
      const sequences = await prisma.emailSequence.findMany({
        where: {
          tenantId,
          name: { contains: searchTerm, mode: 'insensitive' },
        },
        take: limit,
      });

      results.push(...sequences.map((s) => ({
        type: 'sequence',
        id: s.id,
        title: s.name,
        subtitle: s.description ?? undefined,
        url: `/sequences/${s.id}`,
        metadata: { status: s.status },
      })));
    }

    return reply.send({
      success: true,
      data: {
        query: query.q,
        resultCount: results.length,
        results,
      },
    });
  });

  // ===========================================
  // Quick Search (faster, less detailed)
  // ===========================================

  fastify.get('/quick', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;

    const querySchema = z.object({
      q: z.string().min(1).max(200),
    });
    const query = querySchema.parse(request.query);

    const searchTerm = query.q.toLowerCase();

    const [contacts, companies, deals] = await Promise.all([
      prisma.contact.findMany({
        where: {
          tenantId,
          OR: [
            { email: { contains: searchTerm, mode: 'insensitive' } },
            { firstName: { contains: searchTerm, mode: 'insensitive' } },
            { lastName: { contains: searchTerm, mode: 'insensitive' } },
          ],
        },
        select: { id: true, email: true, firstName: true, lastName: true, avatarUrl: true },
        take: 5,
      }),
      prisma.company.findMany({
        where: {
          tenantId,
          OR: [
            { name: { contains: searchTerm, mode: 'insensitive' } },
            { domain: { contains: searchTerm, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, domain: true, logoUrl: true },
        take: 5,
      }),
      prisma.deal.findMany({
        where: {
          tenantId,
          name: { contains: searchTerm, mode: 'insensitive' },
        },
        select: { id: true, name: true, value: true },
        take: 5,
      }),
    ]);

    return reply.send({
      success: true,
      data: {
        contacts,
        companies,
        deals,
      },
    });
  });
};
