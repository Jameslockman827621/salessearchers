// ===========================================
// Company Finder API Routes (BetterContact Integration)
// https://bettercontact.notion.site/find-people-api
// ===========================================

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@salessearchers/db';
import { logger } from '@salessearchers/shared';
import { getEnrichmentProvider } from '@salessearchers/integrations';

// Schema for searching companies
const searchCompaniesSchema = z.object({
  query: z.string().min(1).max(200),
});

// Schema for finding employees
const findEmployeesSchema = z.object({
  companyName: z.string().optional(),
  companyDomain: z.string().optional(),
  companyLinkedinUrl: z.string().optional(),
  titles: z.array(z.string()).optional(),
  seniorities: z.array(z.string()).optional(),
  departments: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(500).optional().default(100), // Allow up to 500 employees
});

// Schema for importing contacts with enrichment
const importContactsSchema = z.object({
  companyName: z.string().min(1),
  companyDomain: z.string().optional().nullable(),
  companyWebsite: z.string().optional().nullable(), // Relaxed - not requiring valid URL
  companyIndustry: z.string().optional().nullable(),
  companySize: z.string().optional().nullable(),
  companyLocation: z.string().optional().nullable(),
  companyLinkedinUrl: z.string().optional().nullable(), // Relaxed - not requiring valid URL
  contacts: z.array(z.object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    fullName: z.string().optional().nullable(),
    title: z.string().optional().nullable(),
    email: z.string().optional().nullable(), // Relaxed - not requiring valid email format
    phone: z.string().optional().nullable(),
    linkedinUrl: z.string().optional().nullable(),
    department: z.string().optional().nullable(),
    seniority: z.string().optional().nullable(),
  })),
  enrichmentOptions: z.object({
    enrichEmail: z.boolean().default(false),
    enrichPhone: z.boolean().default(false),
  }).optional(),
});

export const companyFinderRoutes: FastifyPluginAsync = async (fastify) => {
  // Search companies
  fastify.get('/search', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const query = searchCompaniesSchema.parse(request.query);
    
    try {
      const enrichmentProvider = getEnrichmentProvider();
      const companies = await enrichmentProvider.searchCompanies(query.query);

      logger.info(`Company search completed`, { 
        context: 'company-finder', 
        query: query.query, 
        resultCount: companies.length 
      });

      return reply.send({
        success: true,
        data: { companies },
      });
    } catch (error) {
      logger.error(`Company search failed: ${error}`, { context: 'company-finder' });
      return reply.status(500).send({
        success: false,
        error: { code: 'SEARCH_FAILED', message: 'Failed to search companies' },
      });
    }
  });

  // Find employees at a company
  fastify.post('/employees', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const body = findEmployeesSchema.parse(request.body);
    
    if (!body.companyName && !body.companyDomain && !body.companyLinkedinUrl) {
      return reply.status(400).send({
        success: false,
        error: { 
          code: 'INSUFFICIENT_DATA', 
          message: 'At least one of companyName, companyDomain, or companyLinkedinUrl is required' 
        },
      });
    }

    try {
      const enrichmentProvider = getEnrichmentProvider();
      
      // Clean up domain - extract just the domain from full URLs
      let cleanDomain = body.companyDomain;
      if (cleanDomain) {
        try {
          // Remove protocol and www prefix
          cleanDomain = cleanDomain
            .replace(/^https?:\/\//i, '')
            .replace(/^www\./i, '')
            .split('/')[0] // Remove any path
            .trim();
        } catch {
          // Keep original if parsing fails
        }
      }
      
      // Also extract company name from domain if not provided or if it looks like a URL
      let companyName = body.companyName;
      if (!companyName || companyName.startsWith('http') || companyName.startsWith('www.')) {
        if (cleanDomain) {
          // Extract company name from domain (e.g., "stripe.com" -> "stripe", "astrazeneca.co.uk" -> "astrazeneca")
          companyName = cleanDomain.split('.')[0];
        }
      }
      
      logger.info(`Finding employees for company`, { 
        context: 'company-finder',
        companyName: companyName,
        companyDomain: cleanDomain,
        companyLinkedinUrl: body.companyLinkedinUrl,
      });

      const employees = await enrichmentProvider.findEmployees({
        companyName: companyName,
        companyDomain: cleanDomain,
        companyLinkedinUrl: body.companyLinkedinUrl,
        titles: body.titles,
        seniorities: body.seniorities,
        departments: body.departments,
        limit: body.limit,
      });

      logger.info(`Employee search completed`, { 
        context: 'company-finder', 
        companyName: companyName,
        companyDomain: cleanDomain,
        resultCount: employees.length 
      });

      return reply.send({
        success: true,
        data: { 
          employees,
          source: process.env.BETTERCONTACT_API_KEY ? 'bettercontact' : 'mock',
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Employee search failed: ${errorMessage}`, { 
        context: 'company-finder',
        error: String(error),
      });
      
      return reply.status(500).send({
        success: false,
        error: { 
          code: 'SEARCH_FAILED', 
          message: `Failed to find employees: ${errorMessage}`,
          details: { originalError: errorMessage },
        },
      });
    }
  });

  // Import contacts with optional enrichment
  fastify.post('/import', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const body = importContactsSchema.parse(request.body);
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    try {
      // Step 1: Find or create the company
      // Build search conditions
      const searchConditions: Prisma.CompanyWhereInput[] = [
        { name: { equals: body.companyName, mode: 'insensitive' as const } },
      ];
      if (body.companyDomain) {
        searchConditions.push({ domain: body.companyDomain });
      }

      let company = await prisma.company.findFirst({
        where: { 
          tenantId,
          OR: searchConditions,
        },
      });

      if (!company) {
        company = await prisma.company.create({
          data: {
            tenantId,
            name: body.companyName,
            domain: body.companyDomain,
            website: body.companyWebsite,
            industry: body.companyIndustry,
            size: body.companySize,
            location: body.companyLocation,
            linkedinUrl: body.companyLinkedinUrl,
          },
        });

        // Log company creation
        await prisma.activity.create({
          data: {
            tenantId,
            userId,
            companyId: company.id,
            type: 'company_created',
            title: 'Company imported',
            description: `${company.name} imported via Company Finder`,
          },
        });

        logger.info(`Company created via import`, { 
          context: 'company-finder', 
          companyId: company.id, 
          companyName: company.name 
        });
      }

      // Step 2: Import contacts FIRST (don't wait for enrichment)
      const contactsToImport = body.contacts;
      const enrichmentOptions = body.enrichmentOptions ?? { enrichEmail: false, enrichPhone: false };
      const needsEnrichment = enrichmentOptions.enrichEmail || enrichmentOptions.enrichPhone;

      // Step 3: Import contacts immediately
      const importedContacts: Array<{ id: string; email: string | null; firstName: string; lastName: string }> = [];
      const skippedContacts: Array<{ reason: string; contact: typeof contactsToImport[0] }> = [];

      for (const contact of contactsToImport) {
        // Check for duplicates by email or LinkedIn URL
        const existingContact = await prisma.contact.findFirst({
          where: {
            tenantId,
            OR: [
              contact.email ? { email: contact.email } : {},
              contact.linkedinUrl ? { linkedinUrl: contact.linkedinUrl } : {},
            ].filter(c => Object.keys(c).length > 0),
          },
        });

        if (existingContact) {
          // Update existing contact
          const updated = await prisma.contact.update({
            where: { id: existingContact.id },
            data: {
              firstName: contact.firstName,
              lastName: contact.lastName,
              title: contact.title ?? existingContact.title,
              phone: contact.phone ?? existingContact.phone,
              linkedinUrl: contact.linkedinUrl ?? existingContact.linkedinUrl,
              companyId: company.id,
            },
          });
          
          importedContacts.push({
            id: updated.id,
            email: updated.email,
            firstName: updated.firstName ?? '',
            lastName: updated.lastName ?? '',
          });
        } else {
          // Create new contact
          const newContact = await prisma.contact.create({
            data: {
              tenantId,
              email: contact.email,
              firstName: contact.firstName,
              lastName: contact.lastName,
              title: contact.title,
              phone: contact.phone,
              linkedinUrl: contact.linkedinUrl,
              companyId: company.id,
              source: 'company_finder',
            },
          });

          importedContacts.push({
            id: newContact.id,
            email: newContact.email,
            firstName: newContact.firstName ?? '',
            lastName: newContact.lastName ?? '',
          });

          // Log contact creation
          await prisma.activity.create({
            data: {
              tenantId,
              userId,
              contactId: newContact.id,
              companyId: company.id,
              type: 'contact_created',
              title: 'Contact imported',
              description: `${contact.firstName} ${contact.lastName} imported from ${company.name}`,
            },
          });
        }
      }

      logger.info(`Import completed`, { 
        context: 'company-finder', 
        companyId: company.id,
        imported: importedContacts.length,
        skipped: skippedContacts.length,
      });

      // Start background enrichment if requested (non-blocking)
      if (needsEnrichment && importedContacts.length > 0) {
        // Run enrichment in background - don't await
        const enrichmentProvider = getEnrichmentProvider();
        
        // Fire and forget - enrich contacts in background
        (async () => {
          try {
            logger.info(`Starting background enrichment for ${importedContacts.length} contacts`, { context: 'company-finder' });
            
            for (const contact of importedContacts) {
              try {
                const result = await enrichmentProvider.enrichContact({
                  firstName: contact.firstName,
                  lastName: contact.lastName,
                  companyName: body.companyName,
                  companyDomain: body.companyDomain ?? undefined,
                  contactId: contact.id,
                }, {
                  enrichEmail: enrichmentOptions.enrichEmail,
                  enrichPhone: enrichmentOptions.enrichPhone,
                });

                // Update contact with enriched data
                if (result && (result.email || result.phone)) {
                  await prisma.contact.update({
                    where: { id: contact.id },
                    data: {
                      email: result.email ?? undefined,
                      phone: result.phone ?? undefined,
                      enrichedAt: new Date(),
                    },
                  });
                  logger.info(`Background enrichment completed for contact ${contact.id}`, { context: 'company-finder', email: result.email, phone: result.phone });
                }
              } catch (enrichError) {
                logger.error(`Background enrichment failed for contact ${contact.id}: ${enrichError}`, { context: 'company-finder' });
              }
            }
          } catch (bgError) {
            logger.error(`Background enrichment batch failed: ${bgError}`, { context: 'company-finder' });
          }
        })();
      }

      return reply.send({
        success: true,
        data: {
          company: {
            id: company.id,
            name: company.name,
            domain: company.domain,
          },
          imported: importedContacts.length,
          skipped: skippedContacts.length,
          contacts: importedContacts,
          enrichmentPending: needsEnrichment,
        },
      });
    } catch (error) {
      logger.error(`Import failed: ${error}`, { context: 'company-finder' });
      return reply.status(500).send({
        success: false,
        error: { code: 'IMPORT_FAILED', message: 'Failed to import contacts' },
      });
    }
  });

  // Get seniority and department options (for filtering)
  fastify.get('/filters', {
    preHandler: [fastify.authenticate],
  }, async (_request, reply) => {
    return reply.send({
      success: true,
      data: {
        seniorities: [
          { value: 'c_suite', label: 'C-Suite' },
          { value: 'vp', label: 'VP' },
          { value: 'director', label: 'Director' },
          { value: 'manager', label: 'Manager' },
          { value: 'senior', label: 'Senior' },
          { value: 'entry', label: 'Entry Level' },
        ],
        departments: [
          { value: 'executive', label: 'Executive' },
          { value: 'sales', label: 'Sales' },
          { value: 'marketing', label: 'Marketing' },
          { value: 'engineering', label: 'Engineering' },
          { value: 'product', label: 'Product' },
          { value: 'operations', label: 'Operations' },
          { value: 'finance', label: 'Finance' },
          { value: 'hr', label: 'Human Resources' },
          { value: 'customer_success', label: 'Customer Success' },
          { value: 'support', label: 'Support' },
        ],
        titles: [
          'CEO', 'CTO', 'CFO', 'COO', 'CMO',
          'VP Sales', 'VP Marketing', 'VP Engineering',
          'Sales Director', 'Marketing Director',
          'Account Executive', 'SDR', 'BDR',
          'Product Manager', 'Software Engineer',
        ],
      },
    });
  });
};

