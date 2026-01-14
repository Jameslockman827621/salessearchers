// ===========================================
// Templates Library API Routes
// ===========================================

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@salessearchers/db';
import { logger } from '@salessearchers/shared';

// ===========================================
// Schemas
// ===========================================

const templateTypes = z.enum([
  'EMAIL_COLD',
  'EMAIL_FOLLOW_UP',
  'EMAIL_BREAK_UP',
  'EMAIL_NURTURE',
  'LINKEDIN_CONNECTION',
  'LINKEDIN_INMAIL',
  'LINKEDIN_REPLY',
  'CALL_SCRIPT',
  'SMS',
]);

const variableSchema = z.object({
  name: z.string(),
  defaultValue: z.string().optional(),
  required: z.boolean().default(false),
});

const createTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  type: templateTypes,
  category: z.string().max(100).optional(),
  subject: z.string().max(500).optional(),
  body: z.string().min(1).max(50000),
  variables: z.array(variableSchema).optional(),
  isShared: z.boolean().default(false),
  isDefault: z.boolean().default(false),
});

const updateTemplateSchema = createTemplateSchema.partial();

// ===========================================
// Helper: Extract Variables from Content
// ===========================================

function extractVariables(content: string): string[] {
  const regex = /\{\{([^}]+)\}\}/g;
  const variables: string[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    const varName = match[1].trim();
    if (!variables.includes(varName)) {
      variables.push(varName);
    }
  }
  return variables;
}

// ===========================================
// Routes
// ===========================================

export const templatesRoutes: FastifyPluginAsync = async (fastify) => {
  // ===========================================
  // List Templates
  // ===========================================

  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const querySchema = z.object({
      type: templateTypes.optional(),
      category: z.string().optional(),
      search: z.string().optional(),
      includeShared: z.coerce.boolean().default(true),
      limit: z.coerce.number().min(1).max(100).default(50),
      offset: z.coerce.number().min(0).default(0),
    });
    const query = querySchema.parse(request.query);

    const where: Prisma.TemplateWhereInput = {
      tenantId,
      OR: query.includeShared
        ? [
            { createdById: userId },
            { isShared: true },
          ]
        : [{ createdById: userId }],
    };
    if (query.type) where.type = query.type;
    if (query.category) where.category = query.category;
    if (query.search) {
      where.AND = {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
          { body: { contains: query.search, mode: 'insensitive' } },
        ],
      };
    }

    const [templates, total] = await Promise.all([
      prisma.template.findMany({
        where,
        orderBy: [{ isDefault: 'desc' }, { useCount: 'desc' }, { updatedAt: 'desc' }],
        take: query.limit,
        skip: query.offset,
        include: {
          createdBy: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      }),
      prisma.template.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: templates,
      pagination: { total, limit: query.limit, offset: query.offset },
    });
  });

  // ===========================================
  // Get Template Categories
  // ===========================================

  fastify.get('/categories', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;

    const categories = await prisma.template.findMany({
      where: { tenantId, category: { not: null } },
      select: { category: true },
      distinct: ['category'],
    });

    return reply.send({
      success: true,
      data: categories.map(c => c.category).filter(Boolean),
    });
  });

  // ===========================================
  // Get Single Template
  // ===========================================

  fastify.get<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const template = await prisma.template.findFirst({
      where: {
        id,
        tenantId,
        OR: [{ createdById: userId }, { isShared: true }],
      },
      include: {
        createdBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    if (!template) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Template not found' },
      });
    }

    return reply.send({ success: true, data: template });
  });

  // ===========================================
  // Create Template
  // ===========================================

  fastify.post('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const data = createTemplateSchema.parse(request.body);
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    // Extract variables from body and subject
    const bodyVars = extractVariables(data.body);
    const subjectVars = data.subject ? extractVariables(data.subject) : [];
    const allVars = [...new Set([...bodyVars, ...subjectVars])];

    // Merge with provided variables
    const providedVarNames = (data.variables || []).map(v => v.name);
    const variables = [
      ...(data.variables || []),
      ...allVars.filter(v => !providedVarNames.includes(v)).map(name => ({ name, required: false })),
    ];

    // If setting as default, unset other defaults of same type
    if (data.isDefault) {
      await prisma.template.updateMany({
        where: { tenantId, type: data.type, isDefault: true },
        data: { isDefault: false },
      });
    }

    const template = await prisma.template.create({
      data: {
        tenant: { connect: { id: tenantId } },
        createdBy: { connect: { id: userId } },
        name: data.name,
        description: data.description,
        type: data.type,
        category: data.category,
        subject: data.subject,
        body: data.body,
        variables: variables as Prisma.InputJsonValue,
        isShared: data.isShared,
        isDefault: data.isDefault,
      },
    });

    logger.info('Template created', { context: 'templates', id: template.id, type: data.type });

    return reply.status(201).send({
      success: true,
      data: { id: template.id },
    });
  });

  // ===========================================
  // Update Template
  // ===========================================

  fastify.put<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const data = updateTemplateSchema.parse(request.body);
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const existing = await prisma.template.findFirst({
      where: { id, tenantId, createdById: userId },
    });

    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Template not found or not authorized' },
      });
    }

    const updateData: Prisma.TemplateUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.subject !== undefined) updateData.subject = data.subject;
    if (data.body !== undefined) updateData.body = data.body;
    if (data.isShared !== undefined) updateData.isShared = data.isShared;

    // Handle variables if body changed
    if (data.body || data.subject) {
      const bodyVars = extractVariables(data.body || existing.body);
      const subjectVars = extractVariables(data.subject || existing.subject || '');
      const allVars = [...new Set([...bodyVars, ...subjectVars])];
      const existingVars = (existing.variables as Array<{ name: string }>) || [];
      const variables = allVars.map(name => {
        const ev = existingVars.find(v => v.name === name);
        return ev || { name, required: false };
      });
      updateData.variables = variables as Prisma.InputJsonValue;
    }
    if (data.variables !== undefined) {
      updateData.variables = data.variables as Prisma.InputJsonValue;
    }

    // Handle isDefault
    if (data.isDefault === true) {
      await prisma.template.updateMany({
        where: { tenantId, type: existing.type, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
      updateData.isDefault = true;
    } else if (data.isDefault === false) {
      updateData.isDefault = false;
    }

    await prisma.template.update({
      where: { id },
      data: updateData,
    });

    return reply.send({ success: true, data: { message: 'Template updated' } });
  });

  // ===========================================
  // Delete Template
  // ===========================================

  fastify.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const existing = await prisma.template.findFirst({
      where: { id, tenantId, createdById: userId },
    });

    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Template not found or not authorized' },
      });
    }

    await prisma.template.delete({ where: { id } });

    logger.info('Template deleted', { context: 'templates', id });

    return reply.send({ success: true, data: { message: 'Template deleted' } });
  });

  // ===========================================
  // Duplicate Template
  // ===========================================

  fastify.post<{ Params: { id: string } }>('/:id/duplicate', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const existing = await prisma.template.findFirst({
      where: {
        id,
        tenantId,
        OR: [{ createdById: userId }, { isShared: true }],
      },
    });

    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Template not found' },
      });
    }

    const duplicate = await prisma.template.create({
      data: {
        tenant: { connect: { id: tenantId } },
        createdBy: { connect: { id: userId } },
        name: `${existing.name} (Copy)`,
        description: existing.description,
        type: existing.type,
        category: existing.category,
        subject: existing.subject,
        body: existing.body,
        variables: existing.variables as Prisma.InputJsonValue ?? undefined,
        isShared: false,
        isDefault: false,
      },
    });

    return reply.status(201).send({
      success: true,
      data: { id: duplicate.id },
    });
  });

  // ===========================================
  // Record Template Use
  // ===========================================

  fastify.post<{ Params: { id: string } }>('/:id/use', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;

    const existing = await prisma.template.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Template not found' },
      });
    }

    await prisma.template.update({
      where: { id },
      data: {
        useCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });

    return reply.send({ success: true, data: { message: 'Use recorded' } });
  });

  // ===========================================
  // Render Template with Variables
  // ===========================================

  fastify.post<{ Params: { id: string } }>('/:id/render', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const renderSchema = z.object({
      variables: z.record(z.string()),
      contactId: z.string().uuid().optional(),
      companyId: z.string().uuid().optional(),
      dealId: z.string().uuid().optional(),
    });
    const data = renderSchema.parse(request.body);

    const template = await prisma.template.findFirst({
      where: {
        id,
        tenantId,
        OR: [{ createdById: userId }, { isShared: true }],
      },
    });

    if (!template) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Template not found' },
      });
    }

    // Build variables from context
    const contextVars: Record<string, string> = { ...data.variables };

    // Add contact data if provided
    if (data.contactId) {
      const contact = await prisma.contact.findFirst({
        where: { id: data.contactId, tenantId },
        include: { company: true },
      });
      if (contact) {
        contextVars['contact.firstName'] = contact.firstName || '';
        contextVars['contact.lastName'] = contact.lastName || '';
        contextVars['contact.fullName'] = [contact.firstName, contact.lastName].filter(Boolean).join(' ');
        contextVars['contact.email'] = contact.email || '';
        contextVars['contact.title'] = contact.title || '';
        contextVars['contact.phone'] = contact.phone || '';
        if (contact.company) {
          contextVars['company.name'] = contact.company.name;
          contextVars['company.domain'] = contact.company.domain || '';
        }
      }
    }

    // Add company data if provided
    if (data.companyId) {
      const company = await prisma.company.findFirst({
        where: { id: data.companyId, tenantId },
      });
      if (company) {
        contextVars['company.name'] = company.name;
        contextVars['company.domain'] = company.domain || '';
        contextVars['company.industry'] = company.industry || '';
      }
    }

    // Add deal data if provided
    if (data.dealId) {
      const deal = await prisma.deal.findFirst({
        where: { id: data.dealId, tenantId },
        include: { stage: true },
      });
      if (deal) {
        contextVars['deal.name'] = deal.name;
        contextVars['deal.value'] = deal.value?.toString() || '';
        contextVars['deal.stage'] = deal.stage?.name || '';
      }
    }

    // Add sender data
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      contextVars['sender.firstName'] = user.firstName || '';
      contextVars['sender.lastName'] = user.lastName || '';
      contextVars['sender.fullName'] = [user.firstName, user.lastName].filter(Boolean).join(' ');
      contextVars['sender.email'] = user.email;
    }

    // Render template
    let renderedSubject = template.subject || '';
    let renderedBody = template.body;

    for (const [key, value] of Object.entries(contextVars)) {
      const regex = new RegExp(`\\{\\{\\s*${key.replace('.', '\\.')}\\s*\\}\\}`, 'g');
      renderedSubject = renderedSubject.replace(regex, value);
      renderedBody = renderedBody.replace(regex, value);
    }

    return reply.send({
      success: true,
      data: {
        subject: renderedSubject,
        body: renderedBody,
        usedVariables: Object.keys(contextVars),
      },
    });
  });

  // ===========================================
  // Get Template Analytics
  // ===========================================

  fastify.get('/analytics/top', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;

    const querySchema = z.object({
      type: templateTypes.optional(),
      limit: z.coerce.number().min(1).max(20).default(10),
    });
    const query = querySchema.parse(request.query);

    const where: Prisma.TemplateWhereInput = { tenantId };
    if (query.type) where.type = query.type;

    const topTemplates = await prisma.template.findMany({
      where,
      orderBy: { useCount: 'desc' },
      take: query.limit,
      select: {
        id: true,
        name: true,
        type: true,
        category: true,
        useCount: true,
        lastUsedAt: true,
        createdBy: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    return reply.send({
      success: true,
      data: topTemplates,
    });
  });
};

