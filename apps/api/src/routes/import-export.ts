// ===========================================
// Import/Export API Routes
// ===========================================

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@salessearchers/db';
import { logger } from '@salessearchers/shared';

// ===========================================
// Routes
// ===========================================

export const importExportRoutes: FastifyPluginAsync = async (fastify) => {
  // ===========================================
  // IMPORT
  // ===========================================

  // Get import jobs
  fastify.get('/imports', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;

    const imports = await prisma.importJob.findMany({
      where: { tenantId },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return reply.send({ success: true, data: imports });
  });

  // Get single import job
  fastify.get<{ Params: { id: string } }>('/imports/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;

    const importJob = await prisma.importJob.findFirst({
      where: { id, tenantId },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    if (!importJob) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Import job not found' },
      });
    }

    return reply.send({ success: true, data: importJob });
  });

  // Create import job (initiate import)
  fastify.post('/imports', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const createSchema = z.object({
      type: z.enum(['CONTACTS', 'COMPANIES', 'DEALS']),
      fileName: z.string(),
      data: z.array(z.record(z.unknown())).min(1).max(10000),
      fieldMapping: z.record(z.string()),
      options: z.object({
        skipDuplicates: z.boolean().default(true),
        updateExisting: z.boolean().default(false),
      }).optional(),
    });
    const data = createSchema.parse(request.body);

    // Create import job
    const importJob = await prisma.importJob.create({
      data: {
        tenantId,
        userId,
        type: data.type,
        fileName: data.fileName,
        fieldMapping: data.fieldMapping,
        options: data.options ?? { skipDuplicates: true, updateExisting: false },
        totalRows: data.data.length,
        status: 'PROCESSING',
        startedAt: new Date(),
      },
    });

    // Process import synchronously for now (should be moved to worker for large imports)
    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ row: number; error: string }> = [];

    try {
      for (let i = 0; i < data.data.length; i++) {
        const row = data.data[i];
        try {
          const mappedData: Record<string, unknown> = {};
          for (const [csvField, dbField] of Object.entries(data.fieldMapping)) {
            if (row[csvField] !== undefined && row[csvField] !== '') {
              mappedData[dbField] = row[csvField];
            }
          }

          switch (data.type) {
            case 'CONTACTS': {
              const email = mappedData.email as string | undefined;
              if (email && data.options?.skipDuplicates) {
                const existing = await prisma.contact.findFirst({
                  where: { tenantId, email },
                });
                if (existing) {
                  if (data.options?.updateExisting) {
                    await prisma.contact.update({
                      where: { id: existing.id },
                      data: mappedData as Prisma.ContactUpdateInput,
                    });
                  }
                  successCount++;
                  continue;
                }
              }
              await prisma.contact.create({
                data: {
                  tenant: { connect: { id: tenantId } },
                  ...mappedData,
                },
              });
              successCount++;
              break;
            }
            case 'COMPANIES': {
              const domain = mappedData.domain as string | undefined;
              if (domain && data.options?.skipDuplicates) {
                const existing = await prisma.company.findFirst({
                  where: { tenantId, domain },
                });
                if (existing) {
                  if (data.options?.updateExisting) {
                    await prisma.company.update({
                      where: { id: existing.id },
                      data: mappedData as Prisma.CompanyUpdateInput,
                    });
                  }
                  successCount++;
                  continue;
                }
              }
              const name = mappedData.name as string;
              if (!name) {
                throw new Error('Name is required');
              }
              await prisma.company.create({
                data: {
                  tenant: { connect: { id: tenantId } },
                  name,
                  ...mappedData,
                },
              });
              successCount++;
              break;
            }
            case 'DEALS': {
              const name = mappedData.name as string;
              if (!name) {
                throw new Error('Name is required');
              }
              await prisma.deal.create({
                data: {
                  tenant: { connect: { id: tenantId } },
                  name,
                  ...mappedData,
                },
              });
              successCount++;
              break;
            }
          }
        } catch (err) {
          errorCount++;
          errors.push({ row: i + 1, error: String(err) });
        }

        // Update progress
        await prisma.importJob.update({
          where: { id: importJob.id },
          data: { processedRows: i + 1 },
        });
      }

      // Complete import
      await prisma.importJob.update({
        where: { id: importJob.id },
        data: {
          status: errorCount === 0 ? 'COMPLETED' : 'COMPLETED',
          successCount,
          errorCount,
          errors: errors.length > 0 ? errors : undefined,
          completedAt: new Date(),
        },
      });

      logger.info('Import completed', { context: 'import', importId: importJob.id, successCount, errorCount });

      return reply.status(201).send({
        success: true,
        data: {
          id: importJob.id,
          status: 'COMPLETED',
          successCount,
          errorCount,
          errors: errors.slice(0, 10),
        },
      });
    } catch (err) {
      await prisma.importJob.update({
        where: { id: importJob.id },
        data: { status: 'FAILED', completedAt: new Date() },
      });
      throw err;
    }
  });

  // ===========================================
  // EXPORT
  // ===========================================

  // Get export jobs
  fastify.get('/exports', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;

    const exports = await prisma.exportJob.findMany({
      where: { tenantId },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return reply.send({ success: true, data: exports });
  });

  // Create export job
  fastify.post('/exports', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const createSchema = z.object({
      type: z.enum(['CONTACTS', 'COMPANIES', 'DEALS', 'ACTIVITIES', 'MEETINGS', 'TASKS']),
      filters: z.record(z.unknown()).optional(),
      columns: z.array(z.string()).optional(),
    });
    const data = createSchema.parse(request.body);

    // Create export job
    const exportJob = await prisma.exportJob.create({
      data: {
        tenant: { connect: { id: tenantId } },
        user: { connect: { id: userId } },
        type: data.type,
        filters: data.filters as Prisma.InputJsonValue | undefined,
        columns: data.columns as Prisma.InputJsonValue | undefined,
        status: 'PROCESSING',
        startedAt: new Date(),
      },
    });

    // Generate export data
    let exportData: Array<Record<string, unknown>> = [];

    try {
      switch (data.type) {
        case 'CONTACTS': {
          const contacts = await prisma.contact.findMany({
            where: { tenantId },
            include: { company: { select: { name: true, domain: true } } },
            take: 10000,
          });
          exportData = contacts.map((c) => ({
            id: c.id,
            email: c.email,
            firstName: c.firstName,
            lastName: c.lastName,
            title: c.title,
            phone: c.phone,
            linkedinUrl: c.linkedinUrl,
            companyName: c.company?.name,
            companyDomain: c.company?.domain,
            source: c.source,
            createdAt: c.createdAt.toISOString(),
          }));
          break;
        }
        case 'COMPANIES': {
          const companies = await prisma.company.findMany({
            where: { tenantId },
            take: 10000,
          });
          exportData = companies.map((c) => ({
            id: c.id,
            name: c.name,
            domain: c.domain,
            website: c.website,
            industry: c.industry,
            size: c.size,
            location: c.location,
            linkedinUrl: c.linkedinUrl,
            createdAt: c.createdAt.toISOString(),
          }));
          break;
        }
        case 'DEALS': {
          const deals = await prisma.deal.findMany({
            where: { tenantId },
            include: {
              stage: { select: { name: true } },
              company: { select: { name: true } },
            },
            take: 10000,
          });
          exportData = deals.map((d) => ({
            id: d.id,
            name: d.name,
            value: d.value,
            currency: d.currency,
            stage: d.stage?.name,
            company: d.company?.name,
            probability: d.probability,
            expectedClose: d.expectedClose?.toISOString(),
            closedAt: d.closedAt?.toISOString(),
            createdAt: d.createdAt.toISOString(),
          }));
          break;
        }
        case 'ACTIVITIES': {
          const activities = await prisma.activity.findMany({
            where: { tenantId },
            include: {
              contact: { select: { email: true, firstName: true, lastName: true } },
              deal: { select: { name: true } },
            },
            take: 10000,
          });
          exportData = activities.map((a) => ({
            id: a.id,
            type: a.type,
            title: a.title,
            description: a.description,
            contact: a.contact?.email,
            deal: a.deal?.name,
            occurredAt: a.occurredAt.toISOString(),
          }));
          break;
        }
        case 'MEETINGS': {
          const meetings = await prisma.meeting.findMany({
            where: { tenantId },
            take: 10000,
          });
          exportData = meetings.map((m) => ({
            id: m.id,
            title: m.title,
            platform: m.platform,
            status: m.status,
            scheduledAt: m.scheduledAt?.toISOString(),
            duration: m.duration,
            createdAt: m.createdAt.toISOString(),
          }));
          break;
        }
        case 'TASKS': {
          const tasks = await prisma.task.findMany({
            where: { tenantId },
            include: {
              assignee: { select: { email: true } },
              contact: { select: { email: true } },
            },
            take: 10000,
          });
          exportData = tasks.map((t) => ({
            id: t.id,
            title: t.title,
            description: t.description,
            status: t.status,
            priority: t.priority,
            assignee: t.assignee?.email,
            contact: t.contact?.email,
            dueAt: t.dueAt?.toISOString(),
            completedAt: t.completedAt?.toISOString(),
            createdAt: t.createdAt.toISOString(),
          }));
          break;
        }
      }

      // Update export job with data
      await prisma.exportJob.update({
        where: { id: exportJob.id },
        data: {
          status: 'COMPLETED',
          totalRows: exportData.length,
          completedAt: new Date(),
        },
      });

      logger.info('Export completed', { context: 'export', exportId: exportJob.id, rowCount: exportData.length });

      return reply.send({
        success: true,
        data: {
          id: exportJob.id,
          status: 'COMPLETED',
          rowCount: exportData.length,
          data: exportData,
        },
      });
    } catch (err) {
      await prisma.exportJob.update({
        where: { id: exportJob.id },
        data: { status: 'FAILED', completedAt: new Date() },
      });
      throw err;
    }
  });
};
