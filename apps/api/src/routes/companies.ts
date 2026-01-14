// ===========================================
// Companies API Routes
// ===========================================

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@salessearchers/db';
import { logger } from '@salessearchers/shared';
import { getEnrichmentProvider } from '@salessearchers/integrations';

const listCompaniesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().optional(),
  industry: z.string().optional(),
});

const createCompanySchema = z.object({
  name: z.string().min(1).max(200),
  domain: z.string().max(255).optional(),
  website: z.string().url().optional(),
  industry: z.string().max(100).optional(),
  size: z.string().max(50).optional(),
  linkedinUrl: z.string().url().optional(),
  location: z.string().max(255).optional(),
  description: z.string().optional(),
});

const updateCompanySchema = createCompanySchema.partial();

export const companiesRoutes: FastifyPluginAsync = async (fastify) => {
  // List companies with pagination and filtering
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const query = listCompaniesSchema.parse(request.query);
    const tenantId = request.tenantId!;

    const where: Prisma.CompanyWhereInput = {
      tenantId,
    };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { domain: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.industry) {
      where.industry = { contains: query.industry, mode: 'insensitive' };
    }

    const [companies, total] = await Promise.all([
      prisma.company.findMany({
        where,
        include: {
          _count: {
            select: { contacts: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.company.count({ where }),
    ]);

    const formattedCompanies = companies.map((c) => ({
      id: c.id,
      name: c.name,
      domain: c.domain,
      website: c.website,
      industry: c.industry,
      size: c.size,
      linkedinUrl: c.linkedinUrl,
      logoUrl: c.logoUrl,
      enrichmentData: c.enrichmentData,
      enrichedAt: c.enrichedAt,
      contactCount: c._count.contacts,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

    return reply.send({
      success: true,
      data: {
        companies: formattedCompanies,
        total,
        page: query.page,
        pageSize: query.pageSize,
      },
    });
  });

  // Get single company
  fastify.get<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;

    const company = await prisma.company.findFirst({
      where: { id, tenantId },
      include: {
        contacts: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            title: true,
          },
          orderBy: { updatedAt: 'desc' },
        },
        deals: {
          include: {
            stage: { select: { name: true } },
          },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });

    if (!company) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Company not found' },
      });
    }

    return reply.send({ success: true, data: company });
  });

  // Create company
  fastify.post('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const data = createCompanySchema.parse(request.body);
    const tenantId = request.tenantId!;

    // Check for duplicate domain
    if (data.domain) {
      const existing = await prisma.company.findFirst({
        where: { tenantId, domain: data.domain },
      });
      if (existing) {
        return reply.status(409).send({
          success: false,
          error: { code: 'DUPLICATE', message: 'Company with this domain already exists' },
        });
      }
    }

    const company = await prisma.company.create({
      data: {
        tenantId,
        name: data.name,
        domain: data.domain,
        website: data.website,
        industry: data.industry,
        size: data.size,
        linkedinUrl: data.linkedinUrl,
        location: data.location,
        description: data.description,
      },
    });

    // Log activity
    await prisma.activity.create({
      data: {
        tenantId,
        userId: request.userId!,
        companyId: company.id,
        type: 'company_created',
        title: 'Company created',
        description: company.name,
      },
    });

    logger.info('Company created', { context: 'companies', companyId: company.id });
    return reply.status(201).send({ success: true, data: { id: company.id } });
  });

  // Update company
  fastify.put<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const data = updateCompanySchema.parse(request.body);
    const tenantId = request.tenantId!;

    const existing = await prisma.company.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Company not found' },
      });
    }

    // Check for duplicate domain
    if (data.domain && data.domain !== existing.domain) {
      const duplicate = await prisma.company.findFirst({
        where: { tenantId, domain: data.domain, id: { not: id } },
      });
      if (duplicate) {
        return reply.status(409).send({
          success: false,
          error: { code: 'DUPLICATE', message: 'Another company with this domain already exists' },
        });
      }
    }

    const company = await prisma.company.update({
      where: { id },
      data,
    });

    logger.info('Company updated', { context: 'companies', companyId: id });
    return reply.send({ success: true, data: { id: company.id } });
  });

  // Delete company
  fastify.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;

    const company = await prisma.company.findFirst({
      where: { id, tenantId },
    });

    if (!company) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Company not found' },
      });
    }

    // Unlink contacts before deleting
    await prisma.contact.updateMany({
      where: { companyId: id },
      data: { companyId: null },
    });

    await prisma.company.delete({ where: { id } });

    logger.info('Company deleted', { context: 'companies', companyId: id });
    return reply.send({ success: true, data: { message: 'Company deleted' } });
  });

  // Enrich company
  fastify.post<{ Params: { id: string } }>('/:id/enrich', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;

    const company = await prisma.company.findFirst({
      where: { id, tenantId },
    });

    if (!company) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Company not found' },
      });
    }

    if (!company.domain) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INSUFFICIENT_DATA', message: 'Company must have domain for enrichment' },
      });
    }

    // Create enrichment job
    const job = await prisma.enrichmentJob.create({
      data: {
        tenantId,
        entityType: 'COMPANY',
        entityId: id,
        provider: process.env.ENRICHMENT_PROVIDER ?? 'mock',
        status: 'PROCESSING',
      },
    });

    try {
      const enrichmentProvider = getEnrichmentProvider();
      const result = await enrichmentProvider.enrichCompanyByDomain(company.domain);

      if (result) {
        await prisma.company.update({
          where: { id },
          data: {
            name: result.name ?? company.name,
            website: result.website ?? company.website,
            industry: result.industry ?? company.industry,
            size: result.size ?? company.size,
            location: result.location ?? company.location,
            description: result.description ?? company.description,
            linkedinUrl: result.linkedinUrl ?? company.linkedinUrl,
            logoUrl: result.logoUrl ?? company.logoUrl,
            enrichmentData: result.raw as Prisma.InputJsonValue,
            enrichedAt: new Date(),
          },
        });

        await prisma.enrichmentJob.update({
          where: { id: job.id },
          data: {
            status: 'COMPLETED',
            responseData: result as unknown as Prisma.InputJsonValue,
            completedAt: new Date(),
            creditsUsed: 1,
          },
        });

        logger.info('Company enriched successfully', { context: 'companies', companyId: id });

        return reply.send({
          success: true,
          data: {
            enrichmentData: result,
            enrichedAt: new Date().toISOString(),
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

      logger.error('Company enrichment failed', { context: 'companies', companyId: id, error: String(error) });

      return reply.status(500).send({
        success: false,
        error: { code: 'ENRICHMENT_ERROR', message: 'Enrichment failed' },
      });
    }
  });
};
