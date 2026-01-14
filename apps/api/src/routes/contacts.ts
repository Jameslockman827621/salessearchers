// ===========================================
// Contacts API Routes
// ===========================================

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@salessearchers/db';
import { logger } from '@salessearchers/shared';
import { getEnrichmentProvider } from '@salessearchers/integrations';

const listContactsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().optional(),
  companyId: z.string().uuid().optional(),
  hasEmail: z.enum(['true', 'false']).optional(),
});

const createContactSchema = z.object({
  email: z.string().email().optional(),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  title: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  linkedinUrl: z.string().url().optional(),
  companyId: z.string().uuid().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const updateContactSchema = createContactSchema.partial().extend({
  companyId: z.string().uuid().nullable().optional(),
});

export const contactsRoutes: FastifyPluginAsync = async (fastify) => {
  // List contacts with pagination and filtering
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const query = listContactsSchema.parse(request.query);
    const tenantId = request.tenantId!;

    const where: Prisma.ContactWhereInput = {
      tenantId,
    };

    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { company: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    if (query.companyId) {
      where.companyId = query.companyId;
    }

    if (query.hasEmail === 'true') {
      where.email = { not: null };
    } else if (query.hasEmail === 'false') {
      where.email = null;
    }

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        include: {
          company: {
            select: { id: true, name: true, domain: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.contact.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: {
        contacts,
        total,
        page: query.page,
        pageSize: query.pageSize,
      },
    });
  });

  // Get single contact
  fastify.get<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;

    const contact = await prisma.contact.findFirst({
      where: { id, tenantId },
      include: {
        company: {
          select: { id: true, name: true, domain: true, website: true },
        },
        deals: {
          include: {
            deal: {
              select: {
                id: true,
                name: true,
                value: true,
                stage: { select: { name: true } },
              },
            },
          },
        },
        sequenceEnrollments: {
          include: {
            sequence: { select: { id: true, name: true } },
          },
          orderBy: { enrolledAt: 'desc' },
          take: 5,
        },
        tasks: {
          where: { status: { not: 'COMPLETED' } },
          orderBy: { dueAt: 'asc' },
          take: 5,
        },
      },
    });

    if (!contact) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Contact not found' },
      });
    }

    return reply.send({ success: true, data: contact });
  });

  // Create contact
  fastify.post('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const data = createContactSchema.parse(request.body);
    const tenantId = request.tenantId!;

    // Check for duplicate email
    if (data.email) {
      const existing = await prisma.contact.findFirst({
        where: { tenantId, email: data.email },
      });
      if (existing) {
        return reply.status(409).send({
          success: false,
          error: { code: 'DUPLICATE', message: 'Contact with this email already exists' },
        });
      }
    }

    const contact = await prisma.contact.create({
      data: {
        tenantId,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        title: data.title,
        phone: data.phone,
        linkedinUrl: data.linkedinUrl,
        companyId: data.companyId,
        source: data.source ?? 'manual',
      },
    });

    // Log activity
    await prisma.activity.create({
      data: {
        tenantId,
        userId: request.userId!,
        contactId: contact.id,
        type: 'contact_created',
        title: 'Contact created',
        description: `${contact.firstName ?? ''} ${contact.lastName ?? ''} (${contact.email ?? 'no email'})`.trim(),
      },
    });

    logger.info('Contact created', { context: 'contacts', contactId: contact.id });
    return reply.status(201).send({ success: true, data: { id: contact.id } });
  });

  // Update contact
  fastify.put<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const data = updateContactSchema.parse(request.body);
    const tenantId = request.tenantId!;

    const existing = await prisma.contact.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Contact not found' },
      });
    }

    // Check for duplicate email
    if (data.email && data.email !== existing.email) {
      const duplicate = await prisma.contact.findFirst({
        where: { tenantId, email: data.email, id: { not: id } },
      });
      if (duplicate) {
        return reply.status(409).send({
          success: false,
          error: { code: 'DUPLICATE', message: 'Another contact with this email already exists' },
        });
      }
    }

    const contact = await prisma.contact.update({
      where: { id },
      data: {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        title: data.title,
        phone: data.phone,
        linkedinUrl: data.linkedinUrl,
        companyId: data.companyId,
      },
    });

    logger.info('Contact updated', { context: 'contacts', contactId: id });
    return reply.send({ success: true, data: { id: contact.id } });
  });

  // Delete contact
  fastify.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;

    const contact = await prisma.contact.findFirst({
      where: { id, tenantId },
    });

    if (!contact) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Contact not found' },
      });
    }

    await prisma.contact.delete({ where: { id } });

    logger.info('Contact deleted', { context: 'contacts', contactId: id });
    return reply.send({ success: true, data: { message: 'Contact deleted' } });
  });

  // Enrich contact
  fastify.post<{ Params: { id: string } }>('/:id/enrich', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;

    // Parse enrichment options from request body
    const enrichOptionsSchema = z.object({
      enrichEmail: z.boolean().default(true),
      enrichPhone: z.boolean().default(true),
    });
    const enrichOptions = enrichOptionsSchema.parse(request.body ?? {});

    const contact = await prisma.contact.findFirst({
      where: { id, tenantId },
      include: { company: true },
    });

    if (!contact) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Contact not found' },
      });
    }

    // Need at least some identifying info for enrichment
    if (!contact.email && !contact.linkedinUrl && !contact.firstName) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INSUFFICIENT_DATA', message: 'Contact must have email, LinkedIn URL, or name for enrichment' },
      });
    }

    // Create enrichment job
    const job = await prisma.enrichmentJob.create({
      data: {
        tenantId,
        entityType: 'CONTACT',
        entityId: id,
        provider: 'bettercontact',
        status: 'PROCESSING',
        requestData: {
          enrichEmail: enrichOptions.enrichEmail,
          enrichPhone: enrichOptions.enrichPhone,
        } as Prisma.InputJsonValue,
      },
    });

    try {
      const enrichmentProvider = getEnrichmentProvider();
      
      // Use the full enrichContact method with all available data
      // Include contactId for webhook processing
      const result = await enrichmentProvider.enrichContact({
        contactId: id, // For webhook to update the right contact
        firstName: contact.firstName ?? undefined,
        lastName: contact.lastName ?? undefined,
        email: contact.email ?? undefined,
        linkedinUrl: contact.linkedinUrl ?? undefined,
        companyName: contact.company?.name ?? undefined,
        companyDomain: contact.company?.domain ?? undefined,
      }, enrichOptions);

      if (result) {
        // Update contact with enrichment data
        const updateData: Prisma.ContactUpdateInput = {
          enrichmentData: result.raw as Prisma.InputJsonValue,
          enrichedAt: new Date(),
        };

        // Only update fields if they're empty or if enrichment found new data
        if (result.firstName && !contact.firstName) updateData.firstName = result.firstName;
        if (result.lastName && !contact.lastName) updateData.lastName = result.lastName;
        if (result.title && !contact.title) updateData.title = result.title;
        if (result.email && !contact.email) updateData.email = result.email;
        if (result.phone && !contact.phone) updateData.phone = result.phone;
        if (result.linkedinUrl && !contact.linkedinUrl) updateData.linkedinUrl = result.linkedinUrl;
        if (result.avatarUrl && !contact.avatarUrl) updateData.avatarUrl = result.avatarUrl;

        await prisma.contact.update({
          where: { id },
          data: updateData,
        });

        // If company data returned and contact has no company, create/link it
        if (result.company?.domain && !contact.companyId) {
          let company = await prisma.company.findFirst({
            where: { tenantId, domain: result.company.domain },
          });

          if (!company) {
            company = await prisma.company.create({
              data: {
                tenantId,
                name: result.company.name ?? result.company.domain,
                domain: result.company.domain,
                website: result.company.website,
                industry: result.company.industry,
                size: result.company.size,
                linkedinUrl: result.company.linkedinUrl,
                logoUrl: result.company.logoUrl,
              },
            });
          }

          await prisma.contact.update({
            where: { id },
            data: { companyId: company.id },
          });
        }

        // Calculate credits used
        const creditsUsed = (enrichOptions.enrichEmail ? 1 : 0) + (enrichOptions.enrichPhone ? 1 : 0);

        await prisma.enrichmentJob.update({
          where: { id: job.id },
          data: {
            status: 'COMPLETED',
            responseData: result as unknown as Prisma.InputJsonValue,
            completedAt: new Date(),
            creditsUsed,
          },
        });

        logger.info('Contact enriched successfully', { 
          context: 'contacts', 
          contactId: id,
          emailFound: !!result.email,
          phoneFound: !!result.phone,
        });

        return reply.send({
          success: true,
          data: {
            enrichmentData: result,
            enrichedAt: new Date().toISOString(),
            email: result.email,
            emailStatus: result.emailStatus,
            phone: result.phone,
            phoneStatus: result.phoneStatus,
          },
        });
      } else {
        await prisma.enrichmentJob.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            errorMessage: 'No enrichment data returned',
            completedAt: new Date(),
          },
        });

        return reply.status(422).send({
          success: false,
          error: { code: 'ENRICHMENT_FAILED', message: 'No enrichment data found' },
        });
      }
    } catch (error) {
      await prisma.enrichmentJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          completedAt: new Date(),
        },
      });

      logger.error('Contact enrichment failed', { context: 'contacts', contactId: id, error: String(error) });

      return reply.status(500).send({
        success: false,
        error: { code: 'ENRICHMENT_ERROR', message: 'Enrichment failed' },
      });
    }
  });

  // Bulk enrich contacts
  fastify.post('/bulk-enrich', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const schema = z.object({
      contactIds: z.array(z.string().uuid()).min(1).max(50),
      enrichEmail: z.boolean().default(true),
      enrichPhone: z.boolean().default(true),
    });

    const { contactIds, enrichEmail, enrichPhone } = schema.parse(request.body);
    const tenantId = request.tenantId!;

    const contacts = await prisma.contact.findMany({
      where: { id: { in: contactIds }, tenantId },
      include: { company: true },
    });

    const enrichmentProvider = getEnrichmentProvider();
    let enriched = 0;
    let failed = 0;

    for (const contact of contacts) {
      // Need at least some identifying info
      if (!contact.email && !contact.linkedinUrl && !contact.firstName) {
        failed++;
        continue;
      }

      try {
        const result = await enrichmentProvider.enrichContact({
          firstName: contact.firstName ?? undefined,
          lastName: contact.lastName ?? undefined,
          email: contact.email ?? undefined,
          linkedinUrl: contact.linkedinUrl ?? undefined,
          companyName: contact.company?.name ?? undefined,
          companyDomain: contact.company?.domain ?? undefined,
        }, { enrichEmail, enrichPhone });

        if (result) {
          const updateData: Prisma.ContactUpdateInput = {
            enrichmentData: result.raw as Prisma.InputJsonValue,
            enrichedAt: new Date(),
          };

          // Only update empty fields
          if (result.firstName && !contact.firstName) updateData.firstName = result.firstName;
          if (result.lastName && !contact.lastName) updateData.lastName = result.lastName;
          if (result.title && !contact.title) updateData.title = result.title;
          if (result.email && !contact.email) updateData.email = result.email;
          if (result.phone && !contact.phone) updateData.phone = result.phone;
          if (result.linkedinUrl && !contact.linkedinUrl) updateData.linkedinUrl = result.linkedinUrl;

          await prisma.contact.update({
            where: { id: contact.id },
            data: updateData,
          });
          enriched++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    logger.info('Bulk enrichment completed', { context: 'contacts', enriched, failed });

    return reply.send({
      success: true,
      data: { enriched, failed },
    });
  });
};
