// ===========================================
// BetterContact Data Enrichment Integration
// https://doc.bettercontact.rocks/quickstart
// ===========================================

import { logger } from '@salessearchers/shared';

// ===========================================
// Types
// ===========================================

export interface ContactEnrichmentResult {
  firstName?: string;
  lastName?: string;
  email?: string;
  emailStatus?: 'valid' | 'risky' | 'catch_all' | 'invalid' | 'unknown';
  phone?: string;
  phoneStatus?: 'valid' | 'invalid' | 'unknown';
  title?: string;
  linkedinUrl?: string;
  avatarUrl?: string;
  company?: {
    name?: string;
    domain?: string;
    linkedinUrl?: string;
    website?: string;
    industry?: string;
    size?: string;
    location?: string;
    description?: string;
    logoUrl?: string;
  };
  credits?: {
    email?: number;
    phone?: number;
  };
  raw?: Record<string, unknown>;
}

export interface CompanyEnrichmentResult {
  name?: string;
  domain?: string;
  linkedinUrl?: string;
  website?: string;
  industry?: string;
  size?: string;
  location?: string;
  description?: string;
  logoUrl?: string;
  employeeCount?: number;
  foundedYear?: number;
  technologies?: string[];
  raw?: Record<string, unknown>;
}

export interface EnrichmentOptions {
  enrichEmail?: boolean;
  enrichPhone?: boolean;
}

// Company Finder types (for BetterContact Find People API)
export interface CompanySearchResult {
  id: string;
  name: string;
  domain?: string;
  website?: string;
  industry?: string;
  size?: string;
  location?: string;
  logoUrl?: string;
  linkedinUrl?: string;
  employeeCount?: number;
}

export interface EmployeeSearchResult {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  title?: string;
  email?: string;
  emailStatus?: string;
  phone?: string;
  phoneStatus?: string;
  linkedinUrl?: string;
  avatarUrl?: string;
  department?: string;
  seniority?: string;
}

export interface BulkEnrichmentResult {
  contacts: Array<ContactEnrichmentResult & { customId?: string }>;
  creditsUsed: {
    email?: number;
    phone?: number;
  };
  failed: string[];
}

export interface EnrichmentProvider {
  enrichContactByEmail(email: string, options?: EnrichmentOptions): Promise<ContactEnrichmentResult | null>;
  enrichContactByLinkedinUrl(linkedinUrl: string, options?: EnrichmentOptions): Promise<ContactEnrichmentResult | null>;
  enrichContact(data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    linkedinUrl?: string;
    companyName?: string;
    companyDomain?: string;
  }, options?: EnrichmentOptions): Promise<ContactEnrichmentResult | null>;
  enrichCompanyByDomain(domain: string): Promise<CompanyEnrichmentResult | null>;
  // Company Finder API methods
  searchCompanies(query: string): Promise<CompanySearchResult[]>;
  findEmployees(data: {
    companyName?: string;
    companyDomain?: string;
    companyLinkedinUrl?: string;
    titles?: string[];
    seniorities?: string[];
    departments?: string[];
    limit?: number;
  }): Promise<EmployeeSearchResult[]>;
  bulkEnrichContacts(contacts: Array<{
    customId: string;
    firstName?: string;
    lastName?: string;
    linkedinUrl?: string;
    companyName?: string;
    companyDomain?: string;
  }>, options?: EnrichmentOptions): Promise<BulkEnrichmentResult>;
}

export interface EnrichmentProviderConfig {
  apiKey?: string;
  provider?: 'bettercontact' | 'mock';
  baseUrl?: string;
}

// ===========================================
// BetterContact API Types
// ===========================================

// BetterContact Enrichment API Types
// POST /async - Submit leads for enrichment
// GET /async/{request_id} - Fetch results
// Auth: X-API-Key header

interface BetterContactSubmitRequest {
  data: Array<{
    first_name?: string;
    last_name?: string;
    linkedin_url?: string;
    company?: string;
    company_domain?: string;
    custom_fields?: {
      uuid?: string;
      list_name?: string;
    };
  }>;
  enrich_email_address: boolean;
  enrich_phone_number: boolean;
  webhook?: string;
  process_flow?: string;
}

interface BetterContactSubmitResponse {
  success: boolean;
  id: string;  // Request ID (not batch_id)
  message?: string;
}

interface BetterContactFetchResponse {
  id: string;
  status: 'pending' | 'processing' | 'terminated' | 'failed';
  credits_consumed?: number;
  credits_left?: number;
  summary?: {
    total?: number;
    valid?: number;
    catch_all?: number;
    catch_all_safe?: number;
    catch_all_not_safe?: number;
    undeliverable?: number;
    not_found?: number;
  };
  data?: Array<{
    enriched?: boolean;
    email_provider?: string;
    contact_first_name?: string;
    contact_last_name?: string;
    contact_email_address?: string;
    contact_email_address_status?: 'deliverable' | 'risky' | 'catch_all' | 'undeliverable' | 'unknown';
    contact_phone_number?: string;
    contact_phone_number_status?: string;
    contact_gender?: string;
    contact_job_title?: string;
    contact_linkedin_url?: string;
    company_name?: string;
    company_domain?: string;
    custom_fields?: {
      uuid?: string;
      list_name?: string;
    };
  }>;
}

// Find People API types (https://bettercontact.notion.site/find-people-api)
// Uses the same base URL as enrichment API but different endpoint
// Authentication via query parameter: ?api_key=YOUR_API_KEY

interface BetterContactFindPeopleRequest {
  filters: {
    company?: {
      include?: string[];
      exclude?: string[];
    };
    company_industry?: {
      include?: string[];
      exclude?: string[];
    };
    company_technology?: {
      include?: string[];
      exclude?: string[];
    };
    company_headcount_min?: number;
    company_headcount_max?: number;
    lead_fullname?: {
      include?: string[];
      exclude?: string[];
    };
    lead_linkedin_profile?: {
      include?: string[] | null;
      exclude?: string[];
    };
    lead_department?: {
      include?: string[];
      exclude?: string[];
    };
    lead_function?: {
      include?: string[];
      exclude?: string[];
    };
    lead_skills?: {
      include?: string[];
      exclude?: string[];
    };
    lead_job_title?: {
      include?: string[];
      exclude?: string[];
      exact_match?: boolean;
    };
    lead_location?: {
      include?: string[];
      exclude?: string[];
    };
  };
  max_leads: number;
  webhook?: string | null;
}

interface BetterContactFindPeopleSubmitResponse {
  success: boolean;
  message?: string;
  request_id: string;
}

interface BetterContactFindPeopleResultResponse {
  id: string;
  status: 'pending' | 'processing' | 'terminated' | 'failed';
  credits_left?: string;
  credits_consumed?: string;
  summary?: {
    leads_found: number;
  };
  leads?: Array<{
    contact_id: number;
    contact_full_name: string;
    contact_first_name: string;
    contact_last_name: string;
    contact_job_title?: string;
    contact_seniority?: string;
    contact_headline?: string;
    contact_linkedin_profile_url?: string;
    contact_location_continent?: string;
    contact_location_country?: string;
    contact_location_state?: string;
    contact_location_city?: string;
    contact_email_address?: string | null;
    contact_email_address_status?: string;
    contact_email_address_provider?: string;
    contact_phone_number?: string | null;
    contact_phone_number_cc?: string;
    contact_additional_phone_number?: string;
    company_name?: string;
    company_domain?: string;
    company_description?: string;
    company_linkedin_url?: string;
    company_industry?: string;
    company_type?: string;
    company_founded_year?: number;
    company_head_quarters_city?: string;
    company_head_quarters_country?: string;
    company_employees_range_start?: number;
    company_employees_range_end?: number;
  }>;
}

interface BetterContactCompanySearchResponse {
  success: boolean;
  data?: Array<{
    id: string;
    name: string;
    domain?: string;
    website?: string;
    industry?: string;
    size?: string;
    location?: string;
    logo_url?: string;
    linkedin_url?: string;
    employee_count?: number;
  }>;
}

// ===========================================
// BetterContact Provider Implementation
// ===========================================

function createBetterContactProvider(apiKey: string): EnrichmentProvider {
  const BASE_URL = 'https://app.bettercontact.rocks/api/v2';
  
  // Webhook URL for receiving instant results (set via environment variable)
  // In production, this should be your public API URL
  const WEBHOOK_URL = process.env.BETTERCONTACT_WEBHOOK_URL;
  
  async function submitEnrichment(
    contacts: BetterContactSubmitRequest['data'],
    options: EnrichmentOptions = { enrichEmail: true, enrichPhone: true },
    webhookUrl?: string
  ): Promise<string> {
    const requestBody: BetterContactSubmitRequest = {
      data: contacts,
      enrich_email_address: options.enrichEmail ?? true,
      enrich_phone_number: options.enrichPhone ?? true,
      // Use webhook if provided, or fall back to environment variable
      webhook: webhookUrl ?? WEBHOOK_URL,
    };

    logger.debug(`BetterContact submitting enrichment request`, { 
      context: 'enrichment', 
      contactCount: contacts.length,
      options,
      usingWebhook: !!requestBody.webhook,
    });

    const response = await fetch(`${BASE_URL}/async`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    logger.debug(`BetterContact submit response: ${response.status}`, { 
      context: 'enrichment', 
      body: responseText 
    });

    if (!response.ok) {
      logger.error(`BetterContact submit failed: ${responseText}`, { context: 'enrichment' });
      throw new Error(`BetterContact API error: ${response.status} - ${responseText}`);
    }

    let result: BetterContactSubmitResponse;
    try {
      result = JSON.parse(responseText);
    } catch {
      throw new Error(`BetterContact invalid JSON response: ${responseText}`);
    }
    
    if (!result.success || !result.id) {
      throw new Error(`BetterContact submit failed: ${result.message || 'No request ID returned'}`);
    }

    logger.info(`BetterContact enrichment request submitted: ${result.id}`, { context: 'enrichment' });
    return result.id;
  }

  async function fetchResults(requestId: string, maxAttempts = 90): Promise<BetterContactFetchResponse['data']> {
    // Adaptive polling: start fast, then slow down
    // First 10 attempts: 1s delay (10 seconds)
    // Next 20 attempts: 2s delay (40 seconds)
    // Remaining: 3s delay (up to 3 minutes)
    // Total max time: ~4 minutes
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Adaptive delay: faster at start, slower later
      let delay: number;
      if (attempt < 10) {
        delay = 1000; // First 10 seconds: check every 1s
      } else if (attempt < 30) {
        delay = 2000; // Next 40 seconds: check every 2s
      } else {
        delay = 3000; // After that: check every 3s
      }
      await new Promise(resolve => setTimeout(resolve, delay));

      const response = await fetch(`${BASE_URL}/async/${requestId}`, {
        method: 'GET',
        headers: {
          'X-API-Key': apiKey,
        },
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error(`BetterContact fetch failed: ${error}`, { context: 'enrichment' });
        // Don't throw, just retry
        continue;
      }

      const responseText = await response.text();
      let result: BetterContactFetchResponse;
      try {
        result = JSON.parse(responseText);
      } catch {
        logger.warn(`BetterContact invalid JSON in poll: ${responseText}`, { context: 'enrichment' });
        continue;
      }

      logger.debug(`BetterContact enrichment status: ${result.status}`, { 
        context: 'enrichment', 
        attempt,
        summary: result.summary 
      });

      if (result.status === 'terminated' && result.data) {
        logger.info(`BetterContact enrichment completed: ${requestId}`, { 
          context: 'enrichment', 
          creditsConsumed: result.credits_consumed,
          summary: result.summary
        });
        return result.data;
      }

      if (result.status === 'failed') {
        throw new Error('BetterContact enrichment failed');
      }

      // Still processing, continue polling
    }

    throw new Error('BetterContact enrichment timeout - request took too long');
  }

  async function enrichSingleContact(
    contactData: BetterContactSubmitRequest['data'][0],
    options: EnrichmentOptions
  ): Promise<ContactEnrichmentResult | null> {
    try {
      const requestId = await submitEnrichment([contactData], options);
      const results = await fetchResults(requestId);
      
      if (!results || results.length === 0) {
        logger.warn(`BetterContact returned no results for enrichment`, { context: 'enrichment' });
        return null;
      }

      const enriched = results[0];
      
      // Map BetterContact response fields to our interface
      // Response fields: contact_email_address, contact_phone_number, contact_first_name, etc.
      const emailStatus = enriched.contact_email_address_status;
      let mappedEmailStatus: ContactEnrichmentResult['emailStatus'];
      if (emailStatus === 'deliverable') mappedEmailStatus = 'valid';
      else if (emailStatus === 'risky' || emailStatus === 'catch_all') mappedEmailStatus = 'risky';
      else if (emailStatus === 'undeliverable') mappedEmailStatus = 'invalid';
      else mappedEmailStatus = 'unknown';

      return {
        firstName: enriched.contact_first_name,
        lastName: enriched.contact_last_name,
        email: enriched.contact_email_address,
        emailStatus: mappedEmailStatus,
        phone: enriched.contact_phone_number,
        phoneStatus: enriched.contact_phone_number_status === 'valid' ? 'valid' : 'unknown',
        title: enriched.contact_job_title,
        linkedinUrl: enriched.contact_linkedin_url,
        company: enriched.company_name ? {
          name: enriched.company_name,
          domain: enriched.company_domain,
          website: enriched.company_domain ? `https://${enriched.company_domain}` : undefined,
        } : undefined,
        raw: enriched as unknown as Record<string, unknown>,
      };
    } catch (error) {
      logger.error(`BetterContact enrichment error: ${error}`, { context: 'enrichment' });
      return null;
    }
  }

  return {
    async enrichContactByEmail(email: string, options?: EnrichmentOptions): Promise<ContactEnrichmentResult | null> {
      // Note: BetterContact enrichment API doesn't take email as input - it FINDS emails.
      // If we already have an email, we likely want to verify it or find phone.
      // We can't enrich by email alone - we need name and company.
      logger.warn(`enrichContactByEmail called but BetterContact requires name/company to find email`, { 
        context: 'enrichment', 
        email 
      });
      // Return null since we can't enrich with just an email
      // The caller should use enrichContact with more data
      return null;
    },

    async enrichContactByLinkedinUrl(linkedinUrl: string, options?: EnrichmentOptions): Promise<ContactEnrichmentResult | null> {
      logger.info(`Enriching contact by LinkedIn via BetterContact`, { context: 'enrichment', linkedinUrl });
      return enrichSingleContact({ linkedin_url: linkedinUrl }, options ?? { enrichEmail: true, enrichPhone: true });
    },

    async enrichContact(data: {
      contactId?: string; // Include for webhook processing
      firstName?: string;
      lastName?: string;
      email?: string;
      linkedinUrl?: string;
      companyName?: string;
      companyDomain?: string;
    }, options?: EnrichmentOptions): Promise<ContactEnrichmentResult | null> {
      logger.info(`Enriching contact via BetterContact`, { context: 'enrichment', data });
      return enrichSingleContact({
        first_name: data.firstName,
        last_name: data.lastName,
        linkedin_url: data.linkedinUrl,
        company: data.companyName,
        // Include contact ID for webhook processing
        custom_fields: data.contactId ? { contact_id: data.contactId } : undefined,
        company_domain: data.companyDomain,
      }, options ?? { enrichEmail: true, enrichPhone: true });
    },

    async enrichCompanyByDomain(domain: string): Promise<CompanyEnrichmentResult | null> {
      // BetterContact focuses on contact enrichment, not company enrichment
      // Return basic domain info; for full company enrichment, integrate Clearbit or similar
      logger.info(`Company enrichment via BetterContact (limited)`, { context: 'enrichment', domain });
      
      return {
        domain,
        name: domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1),
        website: `https://${domain}`,
        raw: { source: 'bettercontact', note: 'Company enrichment limited - contact enrichment focus' },
      };
    },

    async searchCompanies(query: string): Promise<CompanySearchResult[]> {
      logger.info(`Searching companies via BetterContact`, { context: 'enrichment', query });
      
      try {
        // BetterContact doesn't have a dedicated company search endpoint
        // We'll use their find-people endpoint with company_name to discover companies
        // For now, return the query as a basic company result that can be used for employee search
        const searchResult: CompanySearchResult = {
          id: `search-${Date.now()}`,
          name: query,
          domain: query.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com',
        };
        
        return [searchResult];
      } catch (error) {
        logger.error(`BetterContact company search error: ${error}`, { context: 'enrichment' });
        return [];
      }
    },

    async findEmployees(data: {
      companyName?: string;
      companyDomain?: string;
      companyLinkedinUrl?: string;
      titles?: string[];
      seniorities?: string[];
      departments?: string[];
      limit?: number;
    }): Promise<EmployeeSearchResult[]> {
      logger.info(`Finding employees via BetterContact Lead Finder API`, { context: 'enrichment', data });
      
      // Build company filter - can use domain or name
      const companyIncludes: string[] = [];
      if (data.companyDomain) {
        companyIncludes.push(data.companyDomain);
      }
      if (data.companyName && !data.companyDomain) {
        // Use company name if no domain provided
        companyIncludes.push(data.companyName);
      }

      if (companyIncludes.length === 0) {
        throw new Error('Either companyName or companyDomain is required');
      }

      // Build request body
      const requestBody: BetterContactFindPeopleRequest = {
        filters: {
          company: {
            include: companyIncludes,
          },
        },
        max_leads: data.limit ?? 50,
        webhook: null,
      };

      // Add optional filters
      if (data.titles && data.titles.length > 0) {
        requestBody.filters.lead_job_title = {
          include: data.titles,
        };
      }
      if (data.departments && data.departments.length > 0) {
        requestBody.filters.lead_department = {
          include: data.departments,
        };
      }
      if (data.seniorities && data.seniorities.length > 0) {
        requestBody.filters.lead_function = {
          include: data.seniorities,
        };
      }

      try {
        // Step 1: Submit the lead finder request
        logger.debug(`Submitting BetterContact Lead Finder request`, { context: 'enrichment', body: requestBody });
        
        const submitUrl = `${BASE_URL}/lead_finder/async?api_key=${apiKey}`;
        logger.debug(`BetterContact Lead Finder URL: ${submitUrl.replace(apiKey, '***')}`, { context: 'enrichment' });
        
        const submitResponse = await fetch(submitUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        const submitText = await submitResponse.text();
        logger.info(`BetterContact Lead Finder submit response`, { 
          context: 'enrichment', 
          status: submitResponse.status,
          body: submitText 
        });

        if (!submitResponse.ok) {
          throw new Error(`BetterContact Lead Finder API error: ${submitResponse.status} - ${submitText}`);
        }

        let submitResult: BetterContactFindPeopleSubmitResponse;
        try {
          submitResult = JSON.parse(submitText);
        } catch {
          throw new Error(`Invalid JSON from BetterContact: ${submitText}`);
        }

        if (!submitResult.success || !submitResult.request_id) {
          throw new Error(`BetterContact Lead Finder failed: ${submitResult.message || JSON.stringify(submitResult)}`);
        }

        const requestId = submitResult.request_id;
        logger.info(`BetterContact Lead Finder request submitted: ${requestId}`, { context: 'enrichment' });

        // Step 2: Poll for results with adaptive backoff
        // According to the docs: GET /async/{request_id}?api_key=YOUR_API_KEY
        const maxAttempts = 90; // 4-5 minutes max with adaptive delays
        let consecutiveErrors = 0;
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          // Adaptive delay: start fast, slow down on errors or over time
          let delay: number;
          if (consecutiveErrors > 0) {
            // Exponential backoff on errors (3s, 6s, 12s, max 30s)
            delay = Math.min(3000 * Math.pow(2, consecutiveErrors - 1), 30000);
          } else if (attempt < 10) {
            delay = 2000; // First 20 seconds: every 2s
          } else if (attempt < 30) {
            delay = 3000; // Next 60 seconds: every 3s
          } else {
            delay = 5000; // After that: every 5s
          }
          await new Promise(resolve => setTimeout(resolve, delay));

          // Try the documented path first: /async/{request_id}
          let resultResponse = await fetch(`${BASE_URL}/async/${requestId}?api_key=${apiKey}`, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
            },
          });

          // If that fails, try the alternative path: /lead_finder/async/{request_id}
          if (!resultResponse.ok) {
            const altResponse = await fetch(`${BASE_URL}/lead_finder/async/${requestId}?api_key=${apiKey}`, {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
              },
            });
            if (altResponse.ok) {
              resultResponse = altResponse;
            }
          }

          if (!resultResponse.ok) {
            const errorText = await resultResponse.text();
            consecutiveErrors++;
            // Log less frequently to reduce noise
            if (consecutiveErrors <= 3 || consecutiveErrors % 5 === 0) {
              logger.warn(`BetterContact Lead Finder poll attempt ${attempt}: ${errorText}`, { context: 'enrichment' });
            }
            continue; // Retry with backoff
          }

          // Reset error count on successful response
          consecutiveErrors = 0;

          const resultText = await resultResponse.text();
          let result: BetterContactFindPeopleResultResponse;
          try {
            result = JSON.parse(resultText);
          } catch {
            logger.warn(`Invalid JSON from BetterContact poll: ${resultText}`, { context: 'enrichment' });
            continue;
          }

          logger.debug(`BetterContact Lead Finder status: ${result.status}`, { 
            context: 'enrichment', 
            attempt,
            leadsFound: result.summary?.leads_found 
          });

          if (result.status === 'terminated') {
            // Success! Return the leads
            const leads = result.leads ?? [];
            logger.info(`BetterContact Lead Finder completed: ${leads.length} leads found`, { 
              context: 'enrichment',
              creditsUsed: result.credits_consumed 
            });

            return leads.map(lead => ({
              id: String(lead.contact_id),
              firstName: lead.contact_first_name,
              lastName: lead.contact_last_name,
              fullName: lead.contact_full_name,
              title: lead.contact_job_title,
              email: lead.contact_email_address ?? undefined,
              emailStatus: lead.contact_email_address_status,
              phone: lead.contact_phone_number ?? undefined,
              phoneStatus: undefined,
              linkedinUrl: lead.contact_linkedin_profile_url,
              avatarUrl: undefined,
              department: undefined,
              seniority: lead.contact_seniority,
            }));
          }

          if (result.status === 'failed') {
            throw new Error('BetterContact Lead Finder request failed');
          }

          // Still processing, continue polling
        }

        throw new Error('BetterContact Lead Finder timed out - please try again in a few minutes');
      } catch (error) {
        logger.error(`BetterContact findEmployees error: ${error}`, { context: 'enrichment' });
        throw error;
      }
    },

    async bulkEnrichContacts(contacts: Array<{
      customId: string;
      firstName?: string;
      lastName?: string;
      linkedinUrl?: string;
      companyName?: string;
      companyDomain?: string;
    }>, options?: EnrichmentOptions): Promise<BulkEnrichmentResult> {
      logger.info(`Bulk enriching ${contacts.length} contacts via BetterContact`, { context: 'enrichment' });
      
      try {
        const batchData = contacts.map(c => ({
          first_name: c.firstName,
          last_name: c.lastName,
          linkedin_url: c.linkedinUrl,
          company: c.companyName,
          company_domain: c.companyDomain,
          custom_fields: {
            uuid: c.customId,
          },
        }));

        const requestId = await submitEnrichment(batchData, options ?? { enrichEmail: true, enrichPhone: true });
        const results = await fetchResults(requestId);
        
        if (!results) {
          return { contacts: [], creditsUsed: {}, failed: contacts.map(c => c.customId) };
        }

        // Map response fields to our interface
        const enrichedContacts = results.map(r => {
          const emailStatus = r.contact_email_address_status;
          let mappedEmailStatus: 'valid' | 'risky' | 'catch_all' | 'invalid' | 'unknown' = 'unknown';
          if (emailStatus === 'deliverable') mappedEmailStatus = 'valid';
          else if (emailStatus === 'risky' || emailStatus === 'catch_all') mappedEmailStatus = 'risky';
          else if (emailStatus === 'undeliverable') mappedEmailStatus = 'invalid';

          return {
            customId: r.custom_fields?.uuid,
            firstName: r.contact_first_name,
            lastName: r.contact_last_name,
            email: r.contact_email_address,
            emailStatus: mappedEmailStatus,
            phone: r.contact_phone_number,
            phoneStatus: r.contact_phone_number_status === 'valid' ? 'valid' as const : 'unknown' as const,
            title: r.contact_job_title,
            linkedinUrl: r.contact_linkedin_url,
            company: r.company_name ? {
              name: r.company_name,
              domain: r.company_domain,
            } : undefined,
            raw: r as unknown as Record<string, unknown>,
          };
        });

        const successIds = new Set(enrichedContacts.map(c => c.customId).filter(Boolean));
        const failed = contacts
          .filter(c => !successIds.has(c.customId))
          .map(c => c.customId);

        return {
          contacts: enrichedContacts,
          creditsUsed: {},
          failed,
        };
      } catch (error) {
        logger.error(`BetterContact bulk enrichment error: ${error}`, { context: 'enrichment' });
        return { contacts: [], creditsUsed: {}, failed: contacts.map(c => c.customId) };
      }
    },
  };
}

// ===========================================
// Mock Provider (for development without API key)
// ===========================================

function createMockEnrichmentProvider(): EnrichmentProvider {
  return {
    async enrichContactByEmail(email: string): Promise<ContactEnrichmentResult | null> {
      logger.debug('Mock enriching contact by email', { context: 'enrichment', email });
      await new Promise(resolve => setTimeout(resolve, 500));

      const [localPart, domain] = email.split('@');
      const nameParts = localPart.replace(/[._]/g, ' ').split(' ');

      return {
        email,
        emailStatus: 'valid',
        firstName: capitalize(nameParts[0]) || 'Unknown',
        lastName: nameParts.length > 1 ? capitalize(nameParts[nameParts.length - 1]) : undefined,
        phone: '+1555' + Math.floor(Math.random() * 9000000 + 1000000),
        phoneStatus: 'valid',
        title: 'Professional',
        linkedinUrl: `https://linkedin.com/in/${localPart}`,
        company: domain ? {
          name: capitalize(domain.split('.')[0]),
          domain,
          website: `https://${domain}`,
          industry: 'Technology',
          size: '11-50',
        } : undefined,
        raw: { source: 'mock', enrichedAt: new Date().toISOString() },
      };
    },

    async enrichContactByLinkedinUrl(linkedinUrl: string): Promise<ContactEnrichmentResult | null> {
      logger.debug('Mock enriching contact by LinkedIn URL', { context: 'enrichment', linkedinUrl });
      await new Promise(resolve => setTimeout(resolve, 500));

      const match = linkedinUrl.match(/linkedin\.com\/in\/([^/?]+)/);
      const username = match?.[1] ?? 'unknown';
      const nameParts = username.replace(/[-_]/g, ' ').split(' ');

      return {
        linkedinUrl,
        firstName: capitalize(nameParts[0]) || 'LinkedIn',
        lastName: nameParts.length > 1 ? capitalize(nameParts[nameParts.length - 1]) : 'User',
        email: `${username}@example.com`,
        emailStatus: 'valid',
        phone: '+1555' + Math.floor(Math.random() * 9000000 + 1000000),
        phoneStatus: 'valid',
        title: 'Professional',
        company: {
          name: 'Example Company',
          domain: 'example.com',
        },
        raw: { source: 'mock', enrichedAt: new Date().toISOString() },
      };
    },

    async enrichContact(data): Promise<ContactEnrichmentResult | null> {
      if (data.email) {
        return this.enrichContactByEmail(data.email);
      }
      if (data.linkedinUrl) {
        return this.enrichContactByLinkedinUrl(data.linkedinUrl);
      }
      return null;
    },

    async enrichCompanyByDomain(domain: string): Promise<CompanyEnrichmentResult | null> {
      logger.debug('Mock enriching company by domain', { context: 'enrichment', domain });
      await new Promise(resolve => setTimeout(resolve, 500));

      return {
        domain,
        name: capitalize(domain.split('.')[0]),
        website: `https://${domain}`,
        linkedinUrl: `https://linkedin.com/company/${domain.split('.')[0]}`,
        industry: 'Technology',
        size: '51-200',
        location: 'San Francisco, CA',
        description: `${capitalize(domain.split('.')[0])} is a company focused on innovative solutions.`,
        employeeCount: 100,
        foundedYear: 2015,
        technologies: ['React', 'Node.js', 'PostgreSQL'],
        raw: { source: 'mock', enrichedAt: new Date().toISOString() },
      };
    },

    async searchCompanies(query: string): Promise<CompanySearchResult[]> {
      logger.debug('Mock searching companies', { context: 'enrichment', query });
      await new Promise(resolve => setTimeout(resolve, 300));

      // Generate mock company results
      const mockCompanies: CompanySearchResult[] = [
        {
          id: `mock-${Date.now()}-1`,
          name: query,
          domain: query.toLowerCase().replace(/\s+/g, '') + '.com',
          website: `https://${query.toLowerCase().replace(/\s+/g, '')}.com`,
          industry: 'Technology',
          size: '51-200',
          location: 'San Francisco, CA',
          employeeCount: 150,
          linkedinUrl: `https://linkedin.com/company/${query.toLowerCase().replace(/\s+/g, '-')}`,
        },
        {
          id: `mock-${Date.now()}-2`,
          name: `${query} Inc`,
          domain: query.toLowerCase().replace(/\s+/g, '') + 'inc.com',
          website: `https://${query.toLowerCase().replace(/\s+/g, '')}inc.com`,
          industry: 'Software',
          size: '11-50',
          location: 'New York, NY',
          employeeCount: 45,
        },
      ];

      return mockCompanies;
    },

    async findEmployees(data: {
      companyName?: string;
      companyDomain?: string;
      companyLinkedinUrl?: string;
      titles?: string[];
      seniorities?: string[];
      departments?: string[];
      limit?: number;
    }): Promise<EmployeeSearchResult[]> {
      logger.debug('Mock finding employees', { context: 'enrichment', data });
      await new Promise(resolve => setTimeout(resolve, 500));

      const limit = data.limit ?? 10;
      const mockEmployees: EmployeeSearchResult[] = [];

      const titles = ['CEO', 'CTO', 'VP Sales', 'Head of Marketing', 'Sales Director', 
        'Account Executive', 'SDR', 'Product Manager', 'Software Engineer', 'Designer'];
      const departments = ['Executive', 'Engineering', 'Sales', 'Marketing', 'Product'];
      const seniorities = ['C-Level', 'VP', 'Director', 'Manager', 'Individual Contributor'];
      const firstNames = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'James', 'Emma', 'Robert', 'Lisa'];
      const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Martinez', 'Wilson'];

      for (let i = 0; i < limit; i++) {
        const firstName = firstNames[i % firstNames.length];
        const lastName = lastNames[i % lastNames.length];
        const domain = data.companyDomain ?? 'company.com';
        
        mockEmployees.push({
          id: `mock-emp-${Date.now()}-${i}`,
          firstName,
          lastName,
          fullName: `${firstName} ${lastName}`,
          title: titles[i % titles.length],
          email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`,
          emailStatus: 'valid',
          phone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
          phoneStatus: 'valid',
          linkedinUrl: `https://linkedin.com/in/${firstName.toLowerCase()}-${lastName.toLowerCase()}-${Math.floor(Math.random() * 1000)}`,
          department: departments[i % departments.length],
          seniority: seniorities[i % seniorities.length],
        });
      }

      return mockEmployees;
    },

    async bulkEnrichContacts(contacts: Array<{
      customId: string;
      firstName?: string;
      lastName?: string;
      linkedinUrl?: string;
      companyName?: string;
      companyDomain?: string;
    }>, options?: EnrichmentOptions): Promise<BulkEnrichmentResult> {
      logger.debug('Mock bulk enriching contacts', { context: 'enrichment', count: contacts.length });
      await new Promise(resolve => setTimeout(resolve, contacts.length * 100));

      const enrichedContacts = contacts.map(c => {
        const domain = c.companyDomain ?? 'company.com';
        return {
          customId: c.customId,
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.firstName && c.lastName 
            ? `${c.firstName.toLowerCase()}.${c.lastName.toLowerCase()}@${domain}`
            : undefined,
          emailStatus: 'valid' as const,
          phone: options?.enrichPhone ? `+1555${Math.floor(1000000 + Math.random() * 9000000)}` : undefined,
          phoneStatus: options?.enrichPhone ? 'valid' as const : undefined,
          linkedinUrl: c.linkedinUrl,
          company: c.companyName ? {
            name: c.companyName,
            domain: c.companyDomain,
          } : undefined,
          raw: { source: 'mock', enrichedAt: new Date().toISOString() },
        };
      });

      return {
        contacts: enrichedContacts,
        creditsUsed: {
          email: options?.enrichEmail ? contacts.length : 0,
          phone: options?.enrichPhone ? contacts.length : 0,
        },
        failed: [],
      };
    },
  };
}

function capitalize(str?: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// ===========================================
// Provider Factory
// ===========================================

/**
 * Creates an enrichment provider based on configuration.
 */
export function createEnrichmentProvider(config?: EnrichmentProviderConfig): EnrichmentProvider {
  const apiKey = config?.apiKey ?? process.env.BETTERCONTACT_API_KEY;
  const providerType = config?.provider ?? (apiKey ? 'bettercontact' : 'mock');
  
  if (providerType === 'bettercontact' && apiKey) {
    logger.info('Using BetterContact for data enrichment', { context: 'enrichment' });
    return createBetterContactProvider(apiKey);
  }

  logger.warn('Using mock enrichment provider. Set BETTERCONTACT_API_KEY for real enrichment.', { context: 'enrichment' });
  return createMockEnrichmentProvider();
}

// ===========================================
// Singleton Instance
// ===========================================

let enrichmentProvider: EnrichmentProvider | null = null;

export function getEnrichmentProvider(): EnrichmentProvider {
  if (!enrichmentProvider) {
    enrichmentProvider = createEnrichmentProvider();
  }
  return enrichmentProvider;
}

// Reset provider (for testing or config changes)
export function resetEnrichmentProvider(): void {
  enrichmentProvider = null;
}
