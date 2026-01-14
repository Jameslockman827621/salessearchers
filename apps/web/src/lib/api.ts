// ===========================================
// API Client (Complete Implementation)
// ===========================================

import type { ApiResponse } from '@salessearchers/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

class ApiError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, headers = {} } = options;

    // Only set Content-Type for requests with a body
    const requestHeaders: Record<string, string> = { ...headers };
    if (body) {
      requestHeaders['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include',
    });

    // Handle non-JSON responses (e.g., plain text errors)
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      const text = await response.text();
      if (!response.ok) {
        throw new ApiError(
          text || `HTTP ${response.status}: ${response.statusText}`,
          'HTTP_ERROR'
        );
      }
      // If somehow successful but not JSON, return empty
      return {} as T;
    }

    let data: ApiResponse<T>;
    try {
      data = await response.json() as ApiResponse<T>;
    } catch {
      throw new ApiError(
        `Invalid JSON response from server (HTTP ${response.status})`,
        'PARSE_ERROR'
      );
    }

    if (!response.ok || !data.success) {
      throw new ApiError(
        data.error?.message ?? 'Request failed',
        data.error?.code ?? 'UNKNOWN_ERROR',
        data.error?.details
      );
    }

    return data.data as T;
  }

  // ===========================================
  // Auth
  // ===========================================

  async login(email: string, password: string) {
    return this.request<{
      user: { id: string; email: string; firstName: string | null; lastName: string | null };
      tenant: { id: string; name: string; slug: string };
      token: string;
    }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
  }

  async register(data: {
    email: string;
    password: string;
    tenantName: string;
    firstName?: string;
    lastName?: string;
  }) {
    return this.request<{
      user: { id: string; email: string; firstName: string | null; lastName: string | null };
      tenant: { id: string; name: string; slug: string };
      token: string;
    }>('/api/auth/register', {
      method: 'POST',
      body: data,
    });
  }

  async logout() {
    return this.request('/api/auth/logout', { method: 'POST' });
  }

  async getMe() {
    return this.request<{
      user: { id: string; email: string; firstName: string | null; lastName: string | null; avatarUrl: string | null };
      tenant: { id: string; name: string; slug: string };
      permissions: string[];
    }>('/api/auth/me');
  }

  // ===========================================
  // Meetings
  // ===========================================

  async getMeetings(params?: { page?: number; pageSize?: number; status?: string }) {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
    if (params?.status) searchParams.set('status', params.status);

    const query = searchParams.toString();
    return this.request<Array<{
      id: string;
      title: string | null;
      meetingUrl: string;
      platform: string;
      status: string;
      scheduledAt: string | null;
      startedAt: string | null;
      endedAt: string | null;
      duration: number | null;
      hasRecording: boolean;
      hasInsights: boolean;
      user: { id: string; email: string; firstName: string | null; lastName: string | null };
      calendarEvent: { id: string; title: string | null; attendees: unknown[] } | null;
      botSession: { id: string; providerBotId: string; joinedAt: string | null } | null;
    }>>(`/api/meetings${query ? `?${query}` : ''}`);
  }

  async getMeeting(id: string) {
    return this.request<{
      id: string;
      title: string | null;
      meetingUrl: string;
      platform: string;
      status: string;
      scheduledAt: string | null;
      startedAt: string | null;
      endedAt: string | null;
      duration: number | null;
      user: { id: string; email: string; firstName: string | null; lastName: string | null };
      calendarEvent: unknown | null;
      botSession: unknown | null;
      assets: Array<{ id: string; type: string; url: string | null; mimeType: string | null }>;
      transcript: { id: string; text: string | null; segments: unknown[] } | null;
      insight: {
        id: string;
        summary: string | null;
        actionItems: Array<{ text: string; assignee?: string; dueDate?: string }> | null;
        keyTopics: Array<{ topic: string; mentions?: number }> | null;
        objections: Array<{ text: string; response?: string; resolved?: boolean }> | null;
        nextSteps: Array<{ text: string; owner?: string }> | null;
        coachingTips: Array<{ tip: string; category?: string }> | null;
        sentiment: string | null;
      } | null;
      participants: Array<{ id: string; name: string | null; email: string | null; isExternal: boolean }>;
    }>(`/api/meetings/${id}`);
  }

  async createMeeting(data: { meetingUrl: string; title?: string; scheduledAt?: string }) {
    return this.request<{ id: string; title: string | null; status: string }>('/api/meetings', {
      method: 'POST',
      body: data,
    });
  }

  async cancelMeeting(id: string) {
    return this.request<{ message: string }>(`/api/meetings/${id}/cancel`, { method: 'POST' });
  }

  async regenerateInsights(id: string) {
    return this.request<{ message: string }>(`/api/meetings/${id}/insights/regenerate`, { method: 'POST' });
  }

  async createTasksFromMeeting(id: string) {
    return this.request<{ created: number; taskIds: string[] }>(`/api/meetings/${id}/create-tasks`, { method: 'POST' });
  }

  async getMeetingStats() {
    return this.request<{ total: number; thisWeek: number; recorded: number; withInsights: number }>('/api/meetings/stats');
  }

  // ===========================================
  // Calls (Call-to-Call Mode)
  // ===========================================

  async getCallQueue() {
    return this.request<{
      tasksToday: Array<{
        id: string;
        title: string;
        priority: string;
        dueAt: string | null;
        contact: {
          id: string;
          firstName: string | null;
          lastName: string | null;
          email: string | null;
          phone: string | null;
          title: string | null;
          company: { id: string; name: string; domain: string | null } | null;
        } | null;
        type: 'task';
      }>;
      needsOutreach: Array<{
        id: string;
        firstName: string | null;
        lastName: string | null;
        email: string | null;
        phone: string | null;
        title: string | null;
        company: { id: string; name: string; domain: string | null } | null;
        type: 'outreach';
      }>;
    }>('/api/calls/queue');
  }

  async startCall(contactId: string, title?: string) {
    return this.request<{
      callId: string;
      contact: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        email: string | null;
        phone: string | null;
        title: string | null;
        company: { id: string; name: string; domain: string | null } | null;
      };
      startedAt: string;
    }>('/api/calls/start', {
      method: 'POST',
      body: { contactId, title },
    });
  }

  async endCall(callId: string, data: {
    outcome: string;
    notes?: string;
    transcript?: string;
    nextStepDate?: string;
  }) {
    return this.request<{
      callId: string;
      outcome: string;
      duration: number;
      contact: { id: string; firstName: string | null; lastName: string | null } | null;
    }>(`/api/calls/${callId}/end`, {
      method: 'POST',
      body: data,
    });
  }

  async wrapUpCall(data: {
    callId: string;
    outcome: string;
    notes?: string;
    transcript?: string;
    generateEmail?: boolean;
    createTask?: boolean;
    nextStepDate?: string;
    taskTitle?: string;
    previewOnly?: boolean;
    sendEmail?: boolean;
    emailSubject?: string;
    emailBody?: string;
  }) {
    return this.request<{
      callId: string;
      outcome: string;
      duration: number;
      contact: { id: string; firstName: string | null; lastName: string | null; email: string | null } | null;
      insights: {
        id: string;
        summary: string | null;
        actionItems: Array<{ text: string; assignee?: string; dueDate?: string }>;
        keyTopics: Array<{ topic: string; mentions?: number }>;
      } | null;
      task: { id: string; title: string; dueAt: string | null } | null;
      emailDraft: { subject: string; body: string; tone: string } | null;
      emailSent: { sent: boolean; messageId?: string; error?: string } | null;
    }>('/api/calls/wrap-up', {
      method: 'POST',
      body: data,
    });
  }

  async generateCallBrief(contactId: string, customInstructions?: string) {
    return this.request<{
      contact: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        email: string | null;
        phone: string | null;
        title: string | null;
        company: { id: string; name: string; domain: string | null; industry: string | null } | null;
      };
      personalization: string[];
      openers: string[];
      discoveryQuestions: string[];
      pitch: string;
      objectionHandlers: Record<string, string>;
      closeStatement: string;
    }>('/api/calls/brief', {
      method: 'POST',
      body: { contactId, customInstructions },
    });
  }

  async getActiveCall() {
    return this.request<{
      callId: string;
      startedAt: string;
      contact: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        email: string | null;
        phone: string | null;
        title: string | null;
        company: { id: string; name: string; domain: string | null } | null;
      } | null;
    } | null>('/api/calls/active');
  }

  async getCallHistory(contactId: string) {
    return this.request<Array<{
      id: string;
      title: string | null;
      status: string;
      startedAt: string | null;
      endedAt: string | null;
      duration: number | null;
      hasTranscript: boolean;
      summary: string | null;
    }>>(`/api/calls/contact/${contactId}`);
  }

  // ===========================================
  // Tasks
  // ===========================================

  async getTasks(params?: { page?: number; pageSize?: number; status?: string; overdue?: boolean; assigneeId?: string }) {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
    if (params?.status) searchParams.set('status', params.status);
    if (params?.overdue) searchParams.set('overdue', 'true');
    if (params?.assigneeId) searchParams.set('assigneeId', params.assigneeId);

    const query = searchParams.toString();
    return this.request<Array<{
      id: string;
      title: string;
      description: string | null;
      status: string;
      priority: string;
      dueAt: string | null;
      completedAt: string | null;
      source: string | null;
      sourceId: string | null;
      assignee: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
      contact: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
      deal: { id: string; name: string } | null;
      createdAt: string;
    }>>(`/api/tasks${query ? `?${query}` : ''}`);
  }

  async getTask(id: string) {
    return this.request<{
      id: string;
      title: string;
      description: string | null;
      status: string;
      priority: string;
      dueAt: string | null;
      completedAt: string | null;
      source: string | null;
      sourceId: string | null;
      assignee: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
      creator: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
      createdAt: string;
      updatedAt: string;
    }>(`/api/tasks/${id}`);
  }

  async getTaskStats() {
    return this.request<{
      overdue: number;
      dueToday: number;
      pending: number;
      completedThisWeek: number;
    }>('/api/tasks/stats');
  }

  async createTask(data: { title: string; description?: string; priority?: string; dueAt?: string; assigneeId?: string }) {
    return this.request<{ id: string; title: string }>('/api/tasks', {
      method: 'POST',
      body: data,
    });
  }

  async updateTask(id: string, data: { status?: string; title?: string; priority?: string; dueAt?: string | null }) {
    return this.request<{ id: string }>(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: data,
    });
  }

  async deleteTask(id: string) {
    return this.request<{ message: string }>(`/api/tasks/${id}`, { method: 'DELETE' });
  }

  async bulkUpdateTaskStatus(ids: string[], status: string) {
    return this.request<{ updated: number }>('/api/tasks/bulk/status', {
      method: 'POST',
      body: { ids, status },
    });
  }

  // ===========================================
  // Calendar
  // ===========================================

  async getCalendarConnections() {
    return this.request<Array<{
      id: string;
      provider: string;
      email: string;
      isActive: boolean;
      lastSyncAt: string | null;
      eventCount: number;
      createdAt: string;
    }>>('/api/calendar/connections');
  }

  async getCalendarEvents() {
    return this.request<Array<{
      id: string;
      externalId: string;
      title: string | null;
      startTime: string;
      endTime: string;
      meetingUrl: string | null;
      platform: string | null;
      attendees: Array<{ email: string; name?: string }>;
      status: string;
      meeting: { id: string; status: string } | null;
      calendarConnection: { provider: string; email: string };
    }>>('/api/calendar/events');
  }

  async getGoogleAuthUrl() {
    return this.request<{ authUrl: string }>('/api/calendar/connect/google');
  }

  async getMicrosoftAuthUrl() {
    return this.request<{ authUrl: string }>('/api/calendar/connect/microsoft');
  }

  async disconnectCalendar(id: string) {
    return this.request<{ message: string }>(`/api/calendar/connections/${id}`, { method: 'DELETE' });
  }

  async syncCalendar(id: string, fullSync?: boolean) {
    return this.request<{ message: string }>(`/api/calendar/connections/${id}/sync`, {
      method: 'POST',
      body: { fullSync },
    });
  }

  async scheduleRecordings(connectionId: string) {
    return this.request<{ scheduled: number; skipped: number }>(`/api/calendar/connections/${connectionId}/schedule-recordings`, {
      method: 'POST',
    });
  }

  async toggleEventRecording(eventId: string) {
    return this.request<{ recording: boolean; meetingId?: string; message: string }>(`/api/calendar/events/${eventId}/toggle-recording`, {
      method: 'POST',
    });
  }

  // ===========================================
  // Settings
  // ===========================================

  async getRecordingPolicy() {
    return this.request<{
      orgDefault: { id: string; ruleType: string; keywords: string[] } | null;
      userOverride: { id: string; ruleType: string; keywords: string[] } | null;
      effective: { id: string; ruleType: string; keywords: string[] } | null;
    }>('/api/settings/recording-policy');
  }

  async updateRecordingPolicy(scope: 'org' | 'user', data: { ruleType: string; keywords?: string[] }) {
    return this.request<{ id: string }>(`/api/settings/recording-policy/${scope}`, {
      method: 'PUT',
      body: data,
    });
  }

  async deleteUserRecordingPolicy() {
    return this.request<{ message: string }>('/api/settings/recording-policy/user', { method: 'DELETE' });
  }

  async getFeatureFlags() {
    return this.request<Array<{ key: string; name: string; description: string | null; enabled: boolean }>>('/api/settings/feature-flags');
  }

  async getPipelineStages() {
    return this.request<Array<{ id: string; name: string; order: number; color: string | null; isWon: boolean; isLost: boolean }>>('/api/settings/pipeline-stages');
  }

  async getTenantSettings() {
    return this.request<{ id: string; name: string; slug: string; domain: string | null; settings: unknown }>('/api/settings/tenant');
  }

  // ===========================================
  // Contacts
  // ===========================================

  async getContacts(params?: { 
    page?: number; 
    pageSize?: number; 
    search?: string; 
    companyId?: string;
    hasEmail?: boolean;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
    if (params?.search) searchParams.set('search', params.search);
    if (params?.companyId) searchParams.set('companyId', params.companyId);
    if (params?.hasEmail !== undefined) searchParams.set('hasEmail', String(params.hasEmail));

    const query = searchParams.toString();
    return this.request<{
      contacts: Array<{
        id: string;
        email: string | null;
        firstName: string | null;
        lastName: string | null;
        title: string | null;
        phone: string | null;
        linkedinUrl: string | null;
        avatarUrl: string | null;
        source: string | null;
        enrichmentData: Record<string, unknown> | null;
        enrichedAt: string | null;
        company: { id: string; name: string; domain: string | null } | null;
        createdAt: string;
        updatedAt: string;
      }>;
      total: number;
      page: number;
      pageSize: number;
    }>(`/api/contacts${query ? `?${query}` : ''}`);
  }

  async getContact(id: string) {
    return this.request<{
      id: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
      title: string | null;
      phone: string | null;
      linkedinUrl: string | null;
      avatarUrl: string | null;
      source: string | null;
      enrichmentData: Record<string, unknown> | null;
      enrichedAt: string | null;
      notes: string | null;
      tags: string[];
      company: { id: string; name: string; domain: string | null } | null;
      deals: Array<{ id: string; name: string; value: number | null; stage: { name: string } }>;
      sequenceEnrollments: Array<{ id: string; status: string; sequence: { name: string } }>;
      tasks: Array<{ id: string; title: string; status: string; dueAt: string | null }>;
      createdAt: string;
      updatedAt: string;
    }>(`/api/contacts/${id}`);
  }

  async createContact(data: {
    email?: string;
    firstName?: string;
    lastName?: string;
    title?: string;
    phone?: string;
    linkedinUrl?: string;
    companyId?: string;
    notes?: string;
    tags?: string[];
  }) {
    return this.request<{ id: string }>('/api/contacts', {
      method: 'POST',
      body: data,
    });
  }

  async updateContact(id: string, data: {
    email?: string;
    firstName?: string;
    lastName?: string;
    title?: string;
    phone?: string;
    linkedinUrl?: string;
    companyId?: string | null;
    notes?: string;
    tags?: string[];
  }) {
    return this.request<{ id: string }>(`/api/contacts/${id}`, {
      method: 'PUT',
      body: data,
    });
  }

  async deleteContact(id: string) {
    return this.request<{ message: string }>(`/api/contacts/${id}`, { method: 'DELETE' });
  }

  async enrichContact(id: string, options?: { enrichEmail?: boolean; enrichPhone?: boolean }) {
    return this.request<{ 
      enrichmentData: Record<string, unknown>; 
      enrichedAt: string;
      email?: string;
      emailStatus?: 'valid' | 'risky' | 'catch_all' | 'invalid' | 'unknown';
      phone?: string;
      phoneStatus?: 'valid' | 'invalid' | 'unknown';
    }>(`/api/contacts/${id}/enrich`, {
      method: 'POST',
      body: options ?? { enrichEmail: true, enrichPhone: true },
    });
  }

  async bulkEnrichContacts(contactIds: string[], options?: { enrichEmail?: boolean; enrichPhone?: boolean }) {
    return this.request<{ enriched: number; failed: number }>('/api/contacts/bulk-enrich', {
      method: 'POST',
      body: { 
        contactIds, 
        enrichEmail: options?.enrichEmail ?? true, 
        enrichPhone: options?.enrichPhone ?? true,
      },
    });
  }

  // ===========================================
  // Companies
  // ===========================================

  async getCompanies(params?: { 
    page?: number; 
    pageSize?: number; 
    search?: string; 
    industry?: string;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
    if (params?.search) searchParams.set('search', params.search);
    if (params?.industry) searchParams.set('industry', params.industry);

    const query = searchParams.toString();
    return this.request<{
      companies: Array<{
        id: string;
        name: string;
        domain: string | null;
        website: string | null;
        industry: string | null;
        size: string | null;
        linkedinUrl: string | null;
        logoUrl: string | null;
        enrichmentData: Record<string, unknown> | null;
        enrichedAt: string | null;
        contactCount: number;
        createdAt: string;
        updatedAt: string;
      }>;
      total: number;
      page: number;
      pageSize: number;
    }>(`/api/companies${query ? `?${query}` : ''}`);
  }

  async getCompany(id: string) {
    return this.request<{
      id: string;
      name: string;
      domain: string | null;
      website: string | null;
      industry: string | null;
      size: string | null;
      linkedinUrl: string | null;
      logoUrl: string | null;
      description: string | null;
      address: string | null;
      enrichmentData: Record<string, unknown> | null;
      enrichedAt: string | null;
      contacts: Array<{ id: string; email: string | null; firstName: string | null; lastName: string | null; title: string | null }>;
      deals: Array<{ id: string; name: string; value: number | null; stage: { name: string } }>;
      createdAt: string;
      updatedAt: string;
    }>(`/api/companies/${id}`);
  }

  async createCompany(data: {
    name: string;
    domain?: string;
    website?: string;
    industry?: string;
    size?: string;
    linkedinUrl?: string;
    description?: string;
    address?: string;
  }) {
    return this.request<{ id: string }>('/api/companies', {
      method: 'POST',
      body: data,
    });
  }

  async updateCompany(id: string, data: {
    name?: string;
    domain?: string;
    website?: string;
    industry?: string;
    size?: string;
    linkedinUrl?: string;
    description?: string;
    address?: string;
  }) {
    return this.request<{ id: string }>(`/api/companies/${id}`, {
      method: 'PUT',
      body: data,
    });
  }

  async deleteCompany(id: string) {
    return this.request<{ message: string }>(`/api/companies/${id}`, { method: 'DELETE' });
  }

  async enrichCompany(id: string) {
    return this.request<{ enrichmentData: Record<string, unknown>; enrichedAt: string }>(`/api/companies/${id}/enrich`, {
      method: 'POST',
    });
  }

  // ===========================================
  // Company Finder (BetterContact Integration)
  // ===========================================

  async searchCompaniesForFinder(query: string) {
    return this.request<{
      companies: Array<{
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
      }>;
    }>(`/api/company-finder/search?query=${encodeURIComponent(query)}`);
  }

  async findEmployees(data: {
    companyName?: string;
    companyDomain?: string;
    companyLinkedinUrl?: string;
    titles?: string[];
    seniorities?: string[];
    departments?: string[];
    limit?: number;
  }) {
    return this.request<{
      employees: Array<{
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
      }>;
    }>('/api/company-finder/employees', {
      method: 'POST',
      body: data,
    });
  }

  async importContactsFromFinder(data: {
    companyName: string;
    companyDomain?: string;
    companyWebsite?: string;
    companyIndustry?: string;
    companySize?: string;
    companyLocation?: string;
    companyLinkedinUrl?: string;
    contacts: Array<{
      id: string;
      firstName: string;
      lastName: string;
      fullName?: string;
      title?: string;
      email?: string;
      phone?: string;
      linkedinUrl?: string;
      department?: string;
      seniority?: string;
    }>;
    enrichmentOptions?: {
      enrichEmail?: boolean;
      enrichPhone?: boolean;
    };
  }) {
    return this.request<{
      company: { id: string; name: string; domain: string | null };
      imported: number;
      skipped: number;
      contacts: Array<{ id: string; email: string | null; firstName: string; lastName: string }>;
    }>('/api/company-finder/import', {
      method: 'POST',
      body: data,
    });
  }

  async getCompanyFinderFilters() {
    return this.request<{
      seniorities: Array<{ value: string; label: string }>;
      departments: Array<{ value: string; label: string }>;
      titles: string[];
    }>('/api/company-finder/filters');
  }

  // ===========================================
  // Pipeline & Deals
  // ===========================================

  async getPipelineDeals(params?: { stageId?: string; contactId?: string; companyId?: string }) {
    const searchParams = new URLSearchParams();
    if (params?.stageId) searchParams.set('stageId', params.stageId);
    if (params?.contactId) searchParams.set('contactId', params.contactId);
    if (params?.companyId) searchParams.set('companyId', params.companyId);

    const query = searchParams.toString();
    return this.request<Array<{
      id: string;
      name: string;
      value: number | null;
      currency: string;
      probability: number | null;
      expectedCloseDate: string | null;
      stage: { id: string; name: string; color: string | null; order: number };
      company: { id: string; name: string } | null;
      contacts: Array<{ id: string; email: string | null; firstName: string | null; lastName: string | null }>;
      owner: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
      createdAt: string;
      updatedAt: string;
    }>>(`/api/pipeline/deals${query ? `?${query}` : ''}`);
  }

  async getDeal(id: string) {
    return this.request<{
      id: string;
      name: string;
      value: number | null;
      currency: string;
      probability: number | null;
      expectedCloseDate: string | null;
      notes: string | null;
      stage: { id: string; name: string; color: string | null; order: number; isWon: boolean; isLost: boolean };
      company: { id: string; name: string } | null;
      contacts: Array<{ 
        contact: { id: string; email: string | null; firstName: string | null; lastName: string | null; title: string | null };
        role: string | null;
        isPrimary: boolean;
      }>;
      owner: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
      tasks: Array<{ id: string; title: string; status: string; dueAt: string | null }>;
      meetings: Array<{ id: string; title: string | null; scheduledAt: string | null; status: string }>;
      emailThreads: Array<{ id: string; subject: string | null; lastMessageAt: string }>;
      createdAt: string;
      updatedAt: string;
    }>(`/api/pipeline/deals/${id}`);
  }

  async createDeal(data: {
    name: string;
    stageId: string;
    value?: number;
    currency?: string;
    probability?: number;
    expectedCloseDate?: string;
    companyId?: string;
    ownerId?: string;
    notes?: string;
  }) {
    return this.request<{ id: string }>('/api/pipeline/deals', {
      method: 'POST',
      body: data,
    });
  }

  async updateDeal(id: string, data: {
    name?: string;
    stageId?: string;
    value?: number | null;
    currency?: string;
    probability?: number | null;
    expectedCloseDate?: string | null;
    companyId?: string | null;
    ownerId?: string | null;
    notes?: string | null;
  }) {
    return this.request<{ id: string }>(`/api/pipeline/deals/${id}`, {
      method: 'PUT',
      body: data,
    });
  }

  async deleteDeal(id: string) {
    return this.request<{ message: string }>(`/api/pipeline/deals/${id}`, { method: 'DELETE' });
  }

  async addContactToDeal(dealId: string, contactId: string, role?: string, isPrimary?: boolean) {
    return this.request<{ message: string }>(`/api/pipeline/deals/${dealId}/contacts`, {
      method: 'POST',
      body: { contactId, role, isPrimary },
    });
  }

  async removeContactFromDeal(dealId: string, contactId: string) {
    return this.request<{ message: string }>(`/api/pipeline/deals/${dealId}/contacts/${contactId}`, {
      method: 'DELETE',
    });
  }

  async createPipelineStage(data: { name: string; order?: number; color?: string; isWon?: boolean; isLost?: boolean }) {
    return this.request<{ id: string }>('/api/pipeline/stages', {
      method: 'POST',
      body: data,
    });
  }

  async updatePipelineStage(id: string, data: { name?: string; order?: number; color?: string; isWon?: boolean; isLost?: boolean }) {
    return this.request<{ id: string }>(`/api/pipeline/stages/${id}`, {
      method: 'PUT',
      body: data,
    });
  }

  async deletePipelineStage(id: string) {
    return this.request<{ message: string }>(`/api/pipeline/stages/${id}`, { method: 'DELETE' });
  }

  // ===========================================
  // AI Coaching
  // ===========================================

  async getCoachingTips(params?: { 
    page?: number; 
    pageSize?: number; 
    category?: string;
    dismissed?: boolean;
    meetingInsightId?: string;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
    if (params?.category) searchParams.set('category', params.category);
    if (params?.dismissed !== undefined) searchParams.set('dismissed', String(params.dismissed));
    if (params?.meetingInsightId) searchParams.set('meetingInsightId', params.meetingInsightId);

    const query = searchParams.toString();
    return this.request<{
      tips: Array<{
        id: string;
        category: string | null;
        title: string;
        tip: string;
        suggestion: string | null;
        severity: string | null;
        isDismissed: boolean;
        meetingInsight: { 
          id: string;
          meeting: { id: string; title: string | null; scheduledAt: string | null } 
        } | null;
        createdAt: string;
      }>;
      total: number;
      page: number;
      pageSize: number;
    }>(`/api/coaching${query ? `?${query}` : ''}`);
  }

  async dismissCoachingTip(id: string) {
    return this.request<{ id: string; isDismissed: boolean }>(`/api/coaching/${id}/dismiss`, {
      method: 'PUT',
    });
  }

  async getCoachingStats() {
    return this.request<{
      totalTips: number;
      activeTips: number;
      dismissedTips: number;
      byCategory: Array<{ category: string; count: number }>;
      bySeverity: Array<{ severity: string; count: number }>;
    }>('/api/coaching/stats');
  }

  // ===========================================
  // Data Rooms
  // ===========================================

  async getDataRooms(params?: { dealId?: string; contactId?: string; status?: string }) {
    const searchParams = new URLSearchParams();
    if (params?.dealId) searchParams.set('dealId', params.dealId);
    if (params?.contactId) searchParams.set('contactId', params.contactId);
    if (params?.status) searchParams.set('status', params.status);

    const query = searchParams.toString();
    return this.request<Array<{
      id: string;
      name: string;
      slug: string;
      description: string | null;
      primaryColor: string | null;
      status: string;
      totalViews: number;
      uniqueVisitors: number;
      lastViewedAt: string | null;
      deal: { id: string; name: string } | null;
      contact: { id: string; email: string | null; firstName: string | null; lastName: string | null } | null;
      _count: { contents: number; views: number };
      createdAt: string;
      updatedAt: string;
    }>>(`/api/data-rooms${query ? `?${query}` : ''}`);
  }

  async getDataRoom(id: string) {
    return this.request<{
      id: string;
      name: string;
      slug: string;
      description: string | null;
      welcomeMessage: string | null;
      primaryColor: string | null;
      logoUrl: string | null;
      bannerUrl: string | null;
      isPasswordProtected: boolean;
      expiresAt: string | null;
      status: string;
      totalViews: number;
      uniqueVisitors: number;
      lastViewedAt: string | null;
      deal: { id: string; name: string; value: number | null } | null;
      contact: { id: string; email: string | null; firstName: string | null; lastName: string | null } | null;
      sections: Array<{
        id: string;
        name: string;
        description: string | null;
        order: number;
        contents: Array<{
          id: string;
          type: string;
          name: string;
          description: string | null;
          url: string | null;
          content: string | null;
          viewCount: number;
        }>;
      }>;
      contents: Array<{
        id: string;
        type: string;
        name: string;
        description: string | null;
        url: string | null;
        content: string | null;
        viewCount: number;
      }>;
      actionItems: Array<{
        id: string;
        title: string;
        description: string | null;
        dueDate: string | null;
        assignedTo: string | null;
        isCompleted: boolean;
        order: number;
      }>;
      views: Array<{
        id: string;
        visitorEmail: string | null;
        visitorName: string | null;
        timeSpent: number;
        viewedAt: string;
        contact: { id: string; email: string | null; firstName: string | null; lastName: string | null } | null;
      }>;
      createdAt: string;
      updatedAt: string;
    }>(`/api/data-rooms/${id}`);
  }

  async createDataRoom(data: {
    name: string;
    dealId?: string;
    contactId?: string;
    description?: string;
    welcomeMessage?: string;
    primaryColor?: string;
    isPasswordProtected?: boolean;
    password?: string;
    expiresAt?: string;
  }) {
    return this.request<{ id: string; slug: string }>('/api/data-rooms', {
      method: 'POST',
      body: data,
    });
  }

  async updateDataRoom(id: string, data: {
    name?: string;
    description?: string;
    welcomeMessage?: string;
    primaryColor?: string;
    status?: string;
    isPasswordProtected?: boolean;
    password?: string;
    expiresAt?: string;
    settings?: Record<string, unknown>;
  }) {
    return this.request<{ id: string }>(`/api/data-rooms/${id}`, {
      method: 'PUT',
      body: data,
    });
  }

  async deleteDataRoom(id: string) {
    return this.request<{ message: string }>(`/api/data-rooms/${id}`, { method: 'DELETE' });
  }

  async createDataRoomSection(dataRoomId: string, data: { name: string; description?: string; order?: number }) {
    return this.request<{ id: string }>(`/api/data-rooms/${dataRoomId}/sections`, {
      method: 'POST',
      body: data,
    });
  }

  async updateDataRoomSection(dataRoomId: string, sectionId: string, data: { name?: string; description?: string; order?: number }) {
    return this.request<{ id: string }>(`/api/data-rooms/${dataRoomId}/sections/${sectionId}`, {
      method: 'PUT',
      body: data,
    });
  }

  async deleteDataRoomSection(dataRoomId: string, sectionId: string) {
    return this.request<{ message: string }>(`/api/data-rooms/${dataRoomId}/sections/${sectionId}`, { method: 'DELETE' });
  }

  async createDataRoomContent(dataRoomId: string, data: {
    sectionId?: string;
    type: string;
    name: string;
    description?: string;
    url?: string;
    embedCode?: string;
    content?: string;
    isRequired?: boolean;
    order?: number;
  }) {
    return this.request<{ id: string }>(`/api/data-rooms/${dataRoomId}/contents`, {
      method: 'POST',
      body: data,
    });
  }

  async updateDataRoomContent(dataRoomId: string, contentId: string, data: {
    name?: string;
    description?: string;
    url?: string;
    content?: string;
    order?: number;
    isRequired?: boolean;
  }) {
    return this.request<{ id: string }>(`/api/data-rooms/${dataRoomId}/contents/${contentId}`, {
      method: 'PUT',
      body: data,
    });
  }

  async deleteDataRoomContent(dataRoomId: string, contentId: string) {
    return this.request<{ message: string }>(`/api/data-rooms/${dataRoomId}/contents/${contentId}`, { method: 'DELETE' });
  }

  async createDataRoomActionItem(dataRoomId: string, data: {
    title: string;
    description?: string;
    dueDate?: string;
    assignedTo?: string;
    order?: number;
  }) {
    return this.request<{ id: string }>(`/api/data-rooms/${dataRoomId}/action-items`, {
      method: 'POST',
      body: data,
    });
  }

  async toggleDataRoomActionItem(dataRoomId: string, itemId: string) {
    return this.request<{ id: string; isCompleted: boolean }>(`/api/data-rooms/${dataRoomId}/action-items/${itemId}/toggle`, {
      method: 'PUT',
    });
  }

  async deleteDataRoomActionItem(dataRoomId: string, itemId: string) {
    return this.request<{ message: string }>(`/api/data-rooms/${dataRoomId}/action-items/${itemId}`, { method: 'DELETE' });
  }

  async getDataRoomAnalytics(id: string) {
    return this.request<{
      id: string;
      totalViews: number;
      uniqueVisitors: number;
      totalTimeSpent: number;
      lastViewedAt: string | null;
      contentStats: Array<{
        id: string;
        name: string;
        type: string;
        viewCount: number;
        downloadCount: number;
        avgTimeSpent: number;
      }>;
      recentViews: Array<{
        id: string;
        visitorEmail: string | null;
        visitorName: string | null;
        timeSpent: number;
        viewedAt: string;
        contact: { id: string; email: string | null; firstName: string | null; lastName: string | null } | null;
      }>;
    }>(`/api/data-rooms/${id}/analytics`);
  }

  // ===========================================
  // LinkedIn Actions
  // ===========================================

  async getLinkedInActions(params?: { 
    contactId?: string; 
    status?: string; 
    actionType?: string;
    limit?: number;
    offset?: number;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.contactId) searchParams.set('contactId', params.contactId);
    if (params?.status) searchParams.set('status', params.status);
    if (params?.actionType) searchParams.set('actionType', params.actionType);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));

    const query = searchParams.toString();
    return this.request<{
      data: Array<{
        id: string;
        actionType: string;
        status: string;
        linkedinUrl: string | null;
        messageBody: string | null;
        connectionNote: string | null;
        scheduledAt: string | null;
        executedAt: string | null;
        errorMessage: string | null;
        contact: { id: string; email: string | null; firstName: string | null; lastName: string | null; linkedinUrl: string | null };
        createdAt: string;
      }>;
      pagination: { total: number; limit: number; offset: number };
    }>(`/api/linkedin${query ? `?${query}` : ''}`);
  }

  async getLinkedInStats() {
    return this.request<{
      byType: Record<string, number>;
      byStatus: Record<string, number>;
      todayActions: number;
      pendingCount: number;
    }>('/api/linkedin/stats');
  }

  async getLinkedInQueue() {
    return this.request<Array<{
      id: string;
      actionType: string;
      linkedinUrl: string | null;
      messageBody: string | null;
      connectionNote: string | null;
      scheduledAt: string | null;
      contact: { id: string; email: string | null; firstName: string | null; lastName: string | null; linkedinUrl: string | null; avatarUrl: string | null };
    }>>('/api/linkedin/queue');
  }

  async createLinkedInAction(data: {
    contactId: string;
    actionType: string;
    linkedinUrl?: string;
    messageSubject?: string;
    messageBody?: string;
    connectionNote?: string;
    scheduledAt?: string;
  }) {
    return this.request<{
      id: string;
      actionType: string;
      status: string;
      contact: { id: string; email: string | null; firstName: string | null; lastName: string | null; linkedinUrl: string | null };
    }>('/api/linkedin', {
      method: 'POST',
      body: data,
    });
  }

  async bulkCreateLinkedInActions(data: {
    contactIds: string[];
    actionType: string;
    messageBody?: string;
    connectionNote?: string;
    scheduledAt?: string;
  }) {
    return this.request<{ created: number; skipped: number; message: string }>('/api/linkedin/bulk', {
      method: 'POST',
      body: data,
    });
  }

  async completeLinkedInAction(id: string, data: { success: boolean; errorMessage?: string; profileData?: Record<string, unknown> }) {
    return this.request<{
      id: string;
      status: string;
      executedAt: string;
    }>(`/api/linkedin/${id}/complete`, {
      method: 'PUT',
      body: data,
    });
  }

  async skipLinkedInAction(id: string) {
    return this.request<{ id: string; status: string }>(`/api/linkedin/${id}/skip`, {
      method: 'PUT',
    });
  }

  async deleteLinkedInAction(id: string) {
    return this.request<{ message: string }>(`/api/linkedin/${id}`, { method: 'DELETE' });
  }

  // ===========================================
  // LinkedIn Accounts & Campaigns
  // ===========================================

  async getLinkedInAccounts() {
    return this.request<Array<{
      id: string;
      profileUrl: string;
      name: string;
      email: string | null;
      avatarUrl: string | null;
      headline: string | null;
      status: 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING' | 'RATE_LIMITED' | 'SUSPENDED';
      connectionMethod: 'COOKIE' | 'CREDENTIALS' | 'EXTENSION';
      dailyConnectionLimit: number;
      dailyMessageLimit: number;
      dailyViewLimit: number;
      lastSyncAt: string | null;
      createdAt: string;
      _count: { campaigns: number; actions: number };
    }>>('/api/linkedin/accounts');
  }

  async connectLinkedInAccount(data: {
    profileUrl: string;
    name: string;
    email?: string;
    headline?: string;
    avatarUrl?: string;
    sessionCookie?: string;
    csrfToken?: string;
    connectionMethod?: 'COOKIE' | 'CREDENTIALS' | 'EXTENSION' | 'INFINITE_LOGIN';
    linkedinPassword?: string;
    twoFASecret?: string;
    country?: string;
  }) {
    return this.request<{ success: boolean; data: { id: string; name: string; status: string } }>('/api/linkedin/accounts', {
      method: 'POST',
      body: data,
    });
  }

  async disconnectLinkedInAccount(id: string) {
    return this.request<{ success: boolean }>(`/api/linkedin/accounts/${id}`, { method: 'DELETE' });
  }

  async updateLinkedInAccountStatus(id: string, data: {
    status?: 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING' | 'RATE_LIMITED' | 'SUSPENDED';
    sessionCookie?: string;
    csrfToken?: string;
  }) {
    return this.request<{ success: boolean; data: { id: string; status: string } }>(`/api/linkedin/accounts/${id}/status`, {
      method: 'PATCH',
      body: data,
    });
  }

  async getLinkedInCampaigns(params?: { accountId?: string; status?: string }) {
    const searchParams = new URLSearchParams();
    if (params?.accountId) searchParams.set('accountId', params.accountId);
    if (params?.status) searchParams.set('status', params.status);
    const query = searchParams.toString();
    return this.request<Array<{
      id: string;
      name: string;
      description: string | null;
      status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';
      dailyLimit: number;
      totalLeads: number;
      sentCount: number;
      acceptedCount: number;
      repliedCount: number;
      account: { id: string; name: string; avatarUrl: string | null; status: string };
      steps: Array<{
        id: string;
        stepNumber: number;
        actionType: string;
        delayDays: number;
        delayHours: number;
        connectionNote: string | null;
        messageBody: string | null;
      }>;
      _count: { leads: number };
      createdAt: string;
    }>>(`/api/linkedin/campaigns${query ? `?${query}` : ''}`);
  }

  async createLinkedInCampaign(data: {
    name: string;
    description?: string;
    accountId: string;
    dailyLimit?: number;
    steps: Array<{
      stepNumber: number;
      actionType: string;
      delayDays?: number;
      delayHours?: number;
      connectionNote?: string;
      messageSubject?: string;
      messageBody?: string;
    }>;
  }) {
    return this.request<{ success: boolean; data: { id: string; name: string } }>('/api/linkedin/campaigns', {
      method: 'POST',
      body: data,
    });
  }

  async updateLinkedInCampaign(id: string, data: {
    name?: string;
    description?: string;
    status?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';
    dailyLimit?: number;
  }) {
    return this.request<{ success: boolean; data: { id: string; name: string; status: string } }>(`/api/linkedin/campaigns/${id}`, {
      method: 'PATCH',
      body: data,
    });
  }

  async deleteLinkedInCampaign(id: string) {
    return this.request<{ success: boolean }>(`/api/linkedin/campaigns/${id}`, { method: 'DELETE' });
  }

  async addLeadsToCampaign(campaignId: string, leads: Array<{
    linkedinUrl: string;
    name: string;
    headline?: string;
    company?: string;
    avatarUrl?: string;
    contactId?: string;
  }>) {
    return this.request<{ success: boolean; data: { created: number; failed: number; total: number } }>(`/api/linkedin/campaigns/${campaignId}/leads`, {
      method: 'POST',
      body: { campaignId, leads },
    });
  }

  async importContactsToCampaign(campaignId: string, contactIds: string[]) {
    return this.request<{ success: boolean; data: { created: number; failed: number; total: number; skippedNoLinkedIn: number } }>(`/api/linkedin/campaigns/${campaignId}/import-contacts`, {
      method: 'POST',
      body: { campaignId, contactIds },
    });
  }

  async getCampaignLeads(campaignId: string, params?: { status?: string; page?: number; limit?: number }) {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    const query = searchParams.toString();
    return this.request<{
      success: boolean;
      data: Array<{
        id: string;
        linkedinUrl: string;
        name: string;
        headline: string | null;
        company: string | null;
        status: string;
        currentStep: number;
        isConnected: boolean;
        contact: { id: string; firstName: string | null; lastName: string | null; email: string | null } | null;
      }>;
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(`/api/linkedin/campaigns/${campaignId}/leads${query ? `?${query}` : ''}`);
  }

  async getLinkedInMessages(params?: { accountId?: string; unread?: boolean }) {
    const searchParams = new URLSearchParams();
    if (params?.accountId) searchParams.set('accountId', params.accountId);
    if (params?.unread) searchParams.set('unread', 'true');
    const query = searchParams.toString();
    return this.request<Array<{
      id: string;
      body: string;
      isOutbound: boolean;
      senderName: string | null;
      receiverName: string | null;
      sentAt: string;
      readAt: string | null;
      contact: { id: string; firstName: string | null; lastName: string | null; email: string | null; avatarUrl: string | null } | null;
    }>>(`/api/linkedin/messages${query ? `?${query}` : ''}`);
  }

  async getLinkedInDashboardStats() {
    return this.request<{
      totalAccounts: number;
      connectedAccounts: number;
      activeCampaigns: number;
      totalLeads: number;
      pendingActions: number;
      completedToday: number;
      repliedCount: number;
      unreadMessages: number;
    }>('/api/linkedin/stats');
  }

  async activateLinkedInCampaign(campaignId: string) {
    return this.request<{ success: boolean; message: string }>(`/api/linkedin/campaigns/${campaignId}/activate`, {
      method: 'POST',
    });
  }

  async pauseLinkedInCampaign(campaignId: string) {
    return this.request<{ success: boolean }>(`/api/linkedin/campaigns/${campaignId}/pause`, {
      method: 'POST',
    });
  }

  async verifyLinkedInAccount(accountId: string) {
    return this.request<{ success: boolean; message: string }>(`/api/linkedin/accounts/${accountId}/verify`, {
      method: 'POST',
    });
  }

  async toggleLinkedInWarmup(accountId: string, enabled: boolean) {
    return this.request<{ success: boolean }>(`/api/linkedin/accounts/${accountId}/warmup`, {
      method: 'POST',
      body: { enabled },
    });
  }

  async getLinkedInAccountUsage(accountId: string) {
    return this.request<{
      connections: { used: number; limit: number; maxLimit: number };
      messages: { used: number; limit: number; maxLimit: number };
      views: { used: number; limit: number; maxLimit: number };
      limitsResetAt: string | null;
      warmup: { enabled: boolean; day: number; multiplier: number };
    }>(`/api/linkedin/accounts/${accountId}/usage`);
  }

  async cancelLinkedInAction(actionId: string) {
    return this.request<{ success: boolean }>(`/api/linkedin/actions/${actionId}/cancel`, {
      method: 'POST',
    });
  }

  async retryLinkedInAction(actionId: string) {
    return this.request<{ success: boolean }>(`/api/linkedin/actions/${actionId}/retry`, {
      method: 'POST',
    });
  }

  async skipLinkedInLead(campaignId: string, leadId: string) {
    return this.request<{ success: boolean }>(`/api/linkedin/campaigns/${campaignId}/leads/${leadId}/skip`, {
      method: 'POST',
    });
  }

  async markLinkedInMessageRead(messageId: string) {
    return this.request<{ success: boolean }>(`/api/linkedin/messages/${messageId}/read`, {
      method: 'POST',
    });
  }

  // ===========================================
  // Activities
  // ===========================================

  async getActivities(params?: { 
    contactId?: string; 
    companyId?: string;
    dealId?: string;
    dataRoomId?: string;
    type?: string;
    limit?: number;
    offset?: number;
    startDate?: string;
    endDate?: string;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.contactId) searchParams.set('contactId', params.contactId);
    if (params?.companyId) searchParams.set('companyId', params.companyId);
    if (params?.dealId) searchParams.set('dealId', params.dealId);
    if (params?.dataRoomId) searchParams.set('dataRoomId', params.dataRoomId);
    if (params?.type) searchParams.set('type', params.type);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));
    if (params?.startDate) searchParams.set('startDate', params.startDate);
    if (params?.endDate) searchParams.set('endDate', params.endDate);

    const query = searchParams.toString();
    return this.request<{
      data: Array<{
        id: string;
        type: string;
        title: string;
        description: string | null;
        metadata: Record<string, unknown> | null;
        occurredAt: string;
        user: { id: string; firstName: string | null; lastName: string | null; avatarUrl: string | null } | null;
        contact: { id: string; email: string | null; firstName: string | null; lastName: string | null } | null;
        company: { id: string; name: string } | null;
        deal: { id: string; name: string } | null;
        dataRoom: { id: string; name: string; slug: string } | null;
      }>;
      pagination: { total: number; limit: number; offset: number };
    }>(`/api/activities${query ? `?${query}` : ''}`);
  }

  async getActivityTypes() {
    return this.request<Array<{ type: string; count: number; label: string }>>('/api/activities/types');
  }

  async getContactTimeline(contactId: string, params?: { limit?: number; offset?: number }) {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));

    const query = searchParams.toString();
    return this.request<{
      data: Array<{
        id: string;
        type: string;
        title: string;
        description: string | null;
        metadata: Record<string, unknown> | null;
        occurredAt: string;
        user: { id: string; firstName: string | null; lastName: string | null; avatarUrl: string | null } | null;
        deal: { id: string; name: string } | null;
        dataRoom: { id: string; name: string; slug: string } | null;
      }>;
      pagination: { total: number; limit: number; offset: number };
    }>(`/api/activities/contact/${contactId}${query ? `?${query}` : ''}`);
  }

  async getDealTimeline(dealId: string, params?: { limit?: number; offset?: number }) {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));

    const query = searchParams.toString();
    return this.request<{
      data: Array<{
        id: string;
        type: string;
        title: string;
        description: string | null;
        metadata: Record<string, unknown> | null;
        occurredAt: string;
        user: { id: string; firstName: string | null; lastName: string | null; avatarUrl: string | null } | null;
        contact: { id: string; email: string | null; firstName: string | null; lastName: string | null } | null;
        dataRoom: { id: string; name: string; slug: string } | null;
      }>;
      pagination: { total: number; limit: number; offset: number };
    }>(`/api/activities/deal/${dealId}${query ? `?${query}` : ''}`);
  }

  async getActivitySummary(days?: number) {
    const query = days ? `?days=${days}` : '';
    return this.request<{
      totalActivities: number;
      byType: Record<string, number>;
      dailyActivities: Array<{ date: string; count: number }>;
      topContacts: Array<{ 
        contact: { id: string; email: string | null; firstName: string | null; lastName: string | null } | undefined; 
        activityCount: number;
      }>;
    }>(`/api/activities/summary${query}`);
  }

  async createActivity(data: {
    contactId?: string;
    companyId?: string;
    dealId?: string;
    dataRoomId?: string;
    type: string;
    title: string;
    description?: string;
    metadata?: Record<string, unknown>;
    occurredAt?: string;
  }) {
    return this.request<{ id: string }>('/api/activities', {
      method: 'POST',
      body: data,
    });
  }

  // ===========================================
  // Analytics
  // ===========================================

  async getAnalyticsOverview(params?: { period?: '7d' | '30d' | '90d' | '12m'; startDate?: string; endDate?: string }) {
    const searchParams = new URLSearchParams();
    if (params?.period) searchParams.set('period', params.period);
    if (params?.startDate) searchParams.set('startDate', params.startDate);
    if (params?.endDate) searchParams.set('endDate', params.endDate);

    const query = searchParams.toString();
    return this.request<{
      period: { startDate: string; endDate: string };
      pipeline: {
        totalValue: number;
        dealCount: number;
        byStage: Array<{
          stageId: string;
          stageName: string;
          color: string | null;
          isWon: boolean;
          isLost: boolean;
          dealCount: number;
          totalValue: number;
        }>;
      };
      wonDeals: { value: number; count: number };
      lostDeals: { value: number; count: number };
      winRate: number;
      activities: Record<string, number>;
      meetings: { total: number; withInsights: number };
      emails: { sent: number; received: number };
      tasks: { completed: number; total: number; completionRate: number };
    }>(`/api/analytics/overview${query ? `?${query}` : ''}`);
  }

  async getAnalyticsForecast() {
    return this.request<{
      forecast: Array<{
        month: string;
        committed: number;
        bestCase: number;
        pipeline: number;
        dealCount: number;
      }>;
      summary: {
        totalPipeline: number;
        weightedPipeline: number;
        dealCount: number;
        avgDealSize: number;
      };
    }>('/api/analytics/forecast');
  }

  async getTeamPerformance(period?: '7d' | '30d' | '90d') {
    const query = period ? `?period=${period}` : '';
    return this.request<{
      period: { startDate: string; endDate: string };
      team: Array<{
        userId: string;
        name: string;
        email: string;
        avatarUrl: string | null;
        role: string;
        stats: {
          dealsWon: number;
          revenueWon: number;
          dealsClosed: number;
          emailsSent: number;
          meetingsHeld: number;
          tasksCompleted: number;
          activities: number;
        };
      }>;
    }>(`/api/analytics/team-performance${query}`);
  }

  async getAnalyticsTrends(period?: '7d' | '30d' | '90d') {
    const query = period ? `?period=${period}` : '';
    return this.request<{
      period: { startDate: string; endDate: string };
      activities: Array<{ date: string; count: number }>;
      emails: Array<{ date: string; sent: number; received: number }>;
      deals: Array<{ date: string; count: number; value: number }>;
    }>(`/api/analytics/trends${query}`);
  }

  async getLeaderboard(params?: { metric?: 'revenue' | 'deals' | 'activities' | 'meetings' | 'emails'; period?: 'week' | 'month' | 'quarter' | 'year' }) {
    const searchParams = new URLSearchParams();
    if (params?.metric) searchParams.set('metric', params.metric);
    if (params?.period) searchParams.set('period', params.period);

    const query = searchParams.toString();
    return this.request<{
      metric: string;
      period: string;
      leaderboard: Array<{
        userId: string;
        name: string;
        avatarUrl: string | null;
        value: number;
        rank: number;
      }>;
    }>(`/api/analytics/leaderboard${query ? `?${query}` : ''}`);
  }

  // ===========================================
  // Search
  // ===========================================

  async globalSearch(query: string, types?: string[], limit?: number) {
    const searchParams = new URLSearchParams();
    searchParams.set('q', query);
    if (types?.length) searchParams.set('types', types.join(','));
    if (limit) searchParams.set('limit', String(limit));

    return this.request<{
      query: string;
      resultCount: number;
      results: Array<{
        type: string;
        id: string;
        title: string;
        subtitle?: string;
        avatarUrl?: string | null;
        url: string;
        metadata?: Record<string, unknown>;
      }>;
    }>(`/api/search?${searchParams.toString()}`);
  }

  async quickSearch(query: string) {
    return this.request<{
      contacts: Array<{ id: string; email: string | null; firstName: string | null; lastName: string | null; avatarUrl: string | null }>;
      companies: Array<{ id: string; name: string; domain: string | null; logoUrl: string | null }>;
      deals: Array<{ id: string; name: string; value: number | null }>;
    }>(`/api/search/quick?q=${encodeURIComponent(query)}`);
  }

  // ===========================================
  // Notes
  // ===========================================

  async getNotes(entityType: 'contact' | 'company' | 'deal' | 'meeting', entityId: string, params?: { limit?: number; offset?: number }) {
    const searchParams = new URLSearchParams();
    searchParams.set('entityType', entityType);
    searchParams.set('entityId', entityId);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));

    return this.request<{
      data: Array<{
        id: string;
        content: string;
        isPinned: boolean;
        createdAt: string;
        updatedAt: string;
        author: { id: string; email: string; firstName: string | null; lastName: string | null; avatarUrl: string | null };
      }>;
      pagination: { total: number; limit: number; offset: number };
    }>(`/api/notes?${searchParams.toString()}`);
  }

  async createNote(data: {
    entityType: 'contact' | 'company' | 'deal' | 'meeting';
    entityId: string;
    content: string;
    isPinned?: boolean;
  }) {
    return this.request<{
      id: string;
      content: string;
      isPinned: boolean;
      createdAt: string;
      author: { id: string; email: string; firstName: string | null; lastName: string | null; avatarUrl: string | null };
    }>('/api/notes', {
      method: 'POST',
      body: data,
    });
  }

  async updateNote(id: string, data: { content?: string; isPinned?: boolean }) {
    return this.request<{
      id: string;
      content: string;
      isPinned: boolean;
      updatedAt: string;
    }>(`/api/notes/${id}`, {
      method: 'PUT',
      body: data,
    });
  }

  async deleteNote(id: string) {
    return this.request<{ message: string }>(`/api/notes/${id}`, { method: 'DELETE' });
  }

  async toggleNotePin(id: string) {
    return this.request<{ id: string; isPinned: boolean }>(`/api/notes/${id}/pin`, { method: 'PUT' });
  }

  // ===========================================
  // Notifications
  // ===========================================

  async getNotifications(params?: { unreadOnly?: boolean; limit?: number; offset?: number }) {
    const searchParams = new URLSearchParams();
    if (params?.unreadOnly) searchParams.set('unreadOnly', 'true');
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));

    const query = searchParams.toString();
    return this.request<{
      data: Array<{
        id: string;
        type: string;
        title: string;
        body: string | null;
        resourceType: string | null;
        resourceId: string | null;
        actionUrl: string | null;
        isRead: boolean;
        createdAt: string;
      }>;
      pagination: { total: number; limit: number; offset: number };
      unreadCount: number;
    }>(`/api/notifications${query ? `?${query}` : ''}`);
  }

  async getUnreadNotificationCount() {
    return this.request<{ count: number }>('/api/notifications/unread-count');
  }

  async markNotificationRead(id: string) {
    return this.request<{ id: string; isRead: boolean }>(`/api/notifications/${id}/read`, { method: 'PUT' });
  }

  async markAllNotificationsRead() {
    return this.request<{ updated: number }>('/api/notifications/read-all', { method: 'PUT' });
  }

  async archiveNotification(id: string) {
    return this.request<{ message: string }>(`/api/notifications/${id}/archive`, { method: 'PUT' });
  }

  async getNotificationPreferences() {
    return this.request<{
      id: string;
      emailEnabled: boolean;
      emailMeetingReminders: boolean;
      emailTaskReminders: boolean;
      emailDealUpdates: boolean;
      emailDataRoomViews: boolean;
      emailWeeklyDigest: boolean;
      inAppEnabled: boolean;
      inAppMeetingUpdates: boolean;
      inAppTaskUpdates: boolean;
      inAppDealUpdates: boolean;
      inAppDataRoomViews: boolean;
      quietHoursEnabled: boolean;
      quietHoursStart: string | null;
      quietHoursEnd: string | null;
    }>('/api/notifications/preferences');
  }

  async updateNotificationPreferences(data: {
    emailEnabled?: boolean;
    emailMeetingReminders?: boolean;
    emailTaskReminders?: boolean;
    emailDealUpdates?: boolean;
    emailDataRoomViews?: boolean;
    emailWeeklyDigest?: boolean;
    inAppEnabled?: boolean;
    inAppMeetingUpdates?: boolean;
    inAppTaskUpdates?: boolean;
    inAppDealUpdates?: boolean;
    inAppDataRoomViews?: boolean;
    quietHoursEnabled?: boolean;
    quietHoursStart?: string;
    quietHoursEnd?: string;
  }) {
    return this.request<{ id: string }>('/api/notifications/preferences', {
      method: 'PUT',
      body: data,
    });
  }

  // ===========================================
  // Import/Export
  // ===========================================

  async getImports() {
    return this.request<Array<{
      id: string;
      type: string;
      status: string;
      fileName: string;
      totalRows: number;
      processedRows: number;
      successCount: number;
      errorCount: number;
      createdAt: string;
      completedAt: string | null;
      user: { id: string; email: string; firstName: string | null; lastName: string | null };
    }>>('/api/import-export/imports');
  }

  async createImport(data: {
    type: 'CONTACTS' | 'COMPANIES' | 'DEALS';
    fileName: string;
    data: Array<Record<string, unknown>>;
    fieldMapping: Record<string, string>;
    options?: { skipDuplicates?: boolean; updateExisting?: boolean };
  }) {
    return this.request<{
      id: string;
      status: string;
      successCount: number;
      errorCount: number;
      errors: Array<{ row: number; error: string }>;
    }>('/api/import-export/imports', {
      method: 'POST',
      body: data,
    });
  }

  async getExports() {
    return this.request<Array<{
      id: string;
      type: string;
      status: string;
      totalRows: number;
      createdAt: string;
      completedAt: string | null;
      user: { id: string; email: string; firstName: string | null; lastName: string | null };
    }>>('/api/import-export/exports');
  }

  async createExport(data: {
    type: 'CONTACTS' | 'COMPANIES' | 'DEALS' | 'ACTIVITIES' | 'MEETINGS' | 'TASKS';
    filters?: Record<string, unknown>;
    columns?: string[];
  }) {
    return this.request<{
      id: string;
      status: string;
      rowCount: number;
      data: Array<Record<string, unknown>>;
    }>('/api/import-export/exports', {
      method: 'POST',
      body: data,
    });
  }

  // ===========================================
  // User & Team
  // ===========================================

  async getUserProfile() {
    return this.request<{
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      avatarUrl: string | null;
      timezone: string;
      role: string;
      createdAt: string;
      updatedAt: string;
    }>('/api/user/profile');
  }

  async updateUserProfile(data: {
    firstName?: string;
    lastName?: string;
    timezone?: string;
    avatarUrl?: string | null;
  }) {
    return this.request<{
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      avatarUrl: string | null;
      timezone: string;
    }>('/api/user/profile', {
      method: 'PUT',
      body: data,
    });
  }

  async changePassword(currentPassword: string, newPassword: string) {
    return this.request<{ message: string }>('/api/user/password', {
      method: 'PUT',
      body: { currentPassword, newPassword },
    });
  }

  async getTeamMembers() {
    return this.request<Array<{
      userId: string;
      role: string;
      isActive: boolean;
      joinedAt: string;
      user: {
        id: string;
        email: string;
        firstName: string | null;
        lastName: string | null;
        avatarUrl: string | null;
        timezone: string;
        createdAt: string;
      };
    }>>('/api/user/team');
  }

  async inviteTeamMember(email: string, role: 'ADMIN' | 'MANAGER' | 'MEMBER') {
    return this.request<{
      id: string;
      email: string;
      role: string;
      expiresAt: string;
      inviteUrl: string;
    }>('/api/user/team/invite', {
      method: 'POST',
      body: { email, role },
    });
  }

  async getPendingInvitations() {
    return this.request<Array<{
      id: string;
      email: string;
      role: string;
      status: string;
      expiresAt: string;
      createdAt: string;
      invitedBy: { id: string; email: string; firstName: string | null; lastName: string | null };
    }>>('/api/user/team/invitations');
  }

  async revokeInvitation(id: string) {
    return this.request<{ message: string }>(`/api/user/team/invitations/${id}`, { method: 'DELETE' });
  }

  async updateMemberRole(userId: string, role: 'ADMIN' | 'MANAGER' | 'MEMBER') {
    return this.request<{ message: string }>(`/api/user/team/${userId}/role`, {
      method: 'PUT',
      body: { role },
    });
  }

  async removeMember(userId: string) {
    return this.request<{ message: string }>(`/api/user/team/${userId}`, { method: 'DELETE' });
  }

  async getSavedViews(entityType?: string) {
    const query = entityType ? `?entityType=${entityType}` : '';
    return this.request<Array<{
      id: string;
      name: string;
      entityType: string;
      filters: Record<string, unknown>;
      columns: string[] | null;
      sortBy: string | null;
      sortOrder: string | null;
      isDefault: boolean;
      isShared: boolean;
    }>>(`/api/user/views${query}`);
  }

  async createSavedView(data: {
    name: string;
    entityType: string;
    filters: Record<string, unknown>;
    columns?: string[];
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    isDefault?: boolean;
    isShared?: boolean;
  }) {
    return this.request<{ id: string }>('/api/user/views', {
      method: 'POST',
      body: data,
    });
  }

  async deleteSavedView(id: string) {
    return this.request<{ message: string }>(`/api/user/views/${id}`, { method: 'DELETE' });
  }

  // ===========================================
  // AI Content Generation
  // ===========================================

  async generateEmail(data: {
    type: 'follow_up' | 'cold' | 'reply';
    contactId?: string;
    dealId?: string;
    meetingId?: string;
    template?: string;
    customInstructions?: string;
  }) {
    return this.request<{
      subject: string;
      body: string;
      tone: 'formal' | 'friendly' | 'urgent';
    }>('/api/ai/generate/email', {
      method: 'POST',
      body: data,
    });
  }

  async generateLinkedInMessage(data: {
    type: 'connection' | 'inmail' | 'reply';
    contactId?: string;
    customInstructions?: string;
  }) {
    return this.request<{ message: string }>('/api/ai/generate/linkedin', {
      method: 'POST',
      body: data,
    });
  }

  async generateCallScript(data: {
    contactId?: string;
    dealId?: string;
    customInstructions?: string;
  }) {
    return this.request<{
      opening: string;
      discovery: string[];
      pitch: string;
      objectionHandlers: Record<string, string>;
      close: string;
    }>('/api/ai/generate/call-script', {
      method: 'POST',
      body: data,
    });
  }

  async generateObjectionResponse(data: {
    objection: string;
    contactId?: string;
    dealId?: string;
  }) {
    return this.request<{ response: string }>('/api/ai/generate/objection-response', {
      method: 'POST',
      body: data,
    });
  }

  async improveText(text: string, goal: 'shorter' | 'longer' | 'formal' | 'casual' | 'persuasive') {
    return this.request<{
      original: string;
      improved: string;
      goal: string;
    }>('/api/ai/improve', {
      method: 'POST',
      body: { text, goal },
    });
  }

  async getAIContentHistory(options?: { type?: string; limit?: number; offset?: number }) {
    const params = new URLSearchParams();
    if (options?.type) params.append('type', options.type);
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    const query = params.toString() ? `?${params.toString()}` : '';

    return this.request<Array<{
      id: string;
      type: string;
      title: string | null;
      content: string;
      sourceType: string | null;
      sourceId: string | null;
      isUsed: boolean;
      rating: number | null;
      createdAt: string;
    }>>(`/api/ai/history${query}`);
  }

  async rateAIContent(id: string, rating: number, feedback?: string) {
    return this.request<{ message: string }>(`/api/ai/${id}/rate`, {
      method: 'POST',
      body: { rating, feedback },
    });
  }

  async markAIContentUsed(id: string, usedInType: string, usedInId?: string) {
    return this.request<{ message: string }>(`/api/ai/${id}/use`, {
      method: 'POST',
      body: { usedInType, usedInId },
    });
  }

  // ===========================================
  // Workflow Automations
  // ===========================================

  async getAutomations(options?: { isActive?: boolean; triggerType?: string; limit?: number; offset?: number }) {
    const params = new URLSearchParams();
    if (options?.isActive !== undefined) params.append('isActive', options.isActive.toString());
    if (options?.triggerType) params.append('triggerType', options.triggerType);
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    const query = params.toString() ? `?${params.toString()}` : '';

    return this.request<Array<{
      id: string;
      name: string;
      description: string | null;
      triggerType: string;
      isActive: boolean;
      runCount: number;
      lastRunAt: string | null;
      lastError: string | null;
      createdAt: string;
      createdBy: { id: string; email: string; firstName: string | null; lastName: string | null };
      _count: { runs: number };
    }>>(`/api/automations${query}`);
  }

  async getAutomation(id: string) {
    return this.request<{
      id: string;
      name: string;
      description: string | null;
      triggerType: string;
      triggerConfig: Record<string, unknown> | null;
      actions: Array<{ type: string; config: Record<string, unknown>; order: number }>;
      isActive: boolean;
      runCount: number;
      lastRunAt: string | null;
      lastError: string | null;
      createdAt: string;
      createdBy: { id: string; email: string; firstName: string | null; lastName: string | null };
      runs: Array<{
        id: string;
        status: string;
        startedAt: string | null;
        completedAt: string | null;
        actionsExecuted: number;
        error: string | null;
        createdAt: string;
      }>;
    }>(`/api/automations/${id}`);
  }

  async createAutomation(data: {
    name: string;
    description?: string;
    triggerType: string;
    triggerConfig?: Record<string, unknown>;
    actions: Array<{ type: string; config: Record<string, unknown>; order: number }>;
    isActive?: boolean;
  }) {
    return this.request<{ id: string }>('/api/automations', {
      method: 'POST',
      body: data,
    });
  }

  async updateAutomation(id: string, data: {
    name?: string;
    description?: string;
    triggerType?: string;
    triggerConfig?: Record<string, unknown>;
    actions?: Array<{ type: string; config: Record<string, unknown>; order: number }>;
    isActive?: boolean;
  }) {
    return this.request<{ message: string }>(`/api/automations/${id}`, {
      method: 'PUT',
      body: data,
    });
  }

  async deleteAutomation(id: string) {
    return this.request<{ message: string }>(`/api/automations/${id}`, { method: 'DELETE' });
  }

  async toggleAutomation(id: string) {
    return this.request<{ isActive: boolean }>(`/api/automations/${id}/toggle`, { method: 'POST' });
  }

  async triggerAutomation(id: string, data?: { entityType?: string; entityId?: string; data?: Record<string, unknown> }) {
    return this.request<{
      runId: string;
      status: 'COMPLETED' | 'FAILED';
      results: Array<{ order: number; type: string; success: boolean; result?: unknown; error?: string }>;
    }>(`/api/automations/${id}/trigger`, {
      method: 'POST',
      body: data ?? {},
    });
  }

  async getAutomationRuns(id: string, options?: { status?: string; limit?: number; offset?: number }) {
    const params = new URLSearchParams();
    if (options?.status) params.append('status', options.status);
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    const query = params.toString() ? `?${params.toString()}` : '';

    return this.request<Array<{
      id: string;
      status: string;
      triggerData: Record<string, unknown> | null;
      entityType: string | null;
      entityId: string | null;
      startedAt: string | null;
      completedAt: string | null;
      actionsExecuted: number;
      actionResults: unknown[] | null;
      error: string | null;
      createdAt: string;
    }>>(`/api/automations/${id}/runs${query}`);
  }

  async getAutomationTriggers() {
    return this.request<Array<{
      type: string;
      name: string;
      category: string;
      configOptions: string[];
    }>>('/api/automations/meta/triggers');
  }

  async getAutomationActions() {
    return this.request<Array<{
      type: string;
      name: string;
      category: string;
      configFields: string[];
    }>>('/api/automations/meta/actions');
  }

  // ===========================================
  // Templates
  // ===========================================

  async getTemplates(options?: { type?: string; category?: string; search?: string; limit?: number; offset?: number }) {
    const params = new URLSearchParams();
    if (options?.type) params.append('type', options.type);
    if (options?.category) params.append('category', options.category);
    if (options?.search) params.append('search', options.search);
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    const query = params.toString() ? `?${params.toString()}` : '';

    return this.request<Array<{
      id: string;
      name: string;
      description: string | null;
      type: string;
      category: string | null;
      subject: string | null;
      body: string;
      variables: Array<{ name: string; defaultValue?: string; required: boolean }> | null;
      isShared: boolean;
      isDefault: boolean;
      useCount: number;
      lastUsedAt: string | null;
      createdAt: string;
      createdBy: { id: string; email: string; firstName: string | null; lastName: string | null };
    }>>(`/api/templates${query}`);
  }

  async getTemplate(id: string) {
    return this.request<{
      id: string;
      name: string;
      description: string | null;
      type: string;
      category: string | null;
      subject: string | null;
      body: string;
      variables: Array<{ name: string; defaultValue?: string; required: boolean }> | null;
      isShared: boolean;
      isDefault: boolean;
      useCount: number;
      lastUsedAt: string | null;
      createdAt: string;
      createdBy: { id: string; email: string; firstName: string | null; lastName: string | null };
    }>(`/api/templates/${id}`);
  }

  async createTemplate(data: {
    name: string;
    description?: string;
    type: string;
    category?: string;
    subject?: string;
    body: string;
    variables?: Array<{ name: string; defaultValue?: string; required: boolean }>;
    isShared?: boolean;
    isDefault?: boolean;
  }) {
    return this.request<{ id: string }>('/api/templates', {
      method: 'POST',
      body: data,
    });
  }

  async updateTemplate(id: string, data: {
    name?: string;
    description?: string;
    type?: string;
    category?: string;
    subject?: string;
    body?: string;
    isShared?: boolean;
    isDefault?: boolean;
  }) {
    return this.request<{ message: string }>(`/api/templates/${id}`, {
      method: 'PUT',
      body: data,
    });
  }

  async deleteTemplate(id: string) {
    return this.request<{ message: string }>(`/api/templates/${id}`, { method: 'DELETE' });
  }

  async duplicateTemplate(id: string) {
    return this.request<{ id: string }>(`/api/templates/${id}/duplicate`, { method: 'POST' });
  }

  async renderTemplate(id: string, data: { variables: Record<string, string>; contactId?: string; companyId?: string; dealId?: string }) {
    return this.request<{ subject: string; body: string; usedVariables: string[] }>(`/api/templates/${id}/render`, {
      method: 'POST',
      body: data,
    });
  }

  async getTemplateCategories() {
    return this.request<string[]>('/api/templates/categories');
  }

  // ===========================================
  // Lead Scoring
  // ===========================================

  async getLeadScores(options?: { grade?: string; minScore?: number; maxScore?: number; sortBy?: string; sortOrder?: 'asc' | 'desc'; limit?: number; offset?: number }) {
    const params = new URLSearchParams();
    if (options?.grade) params.append('grade', options.grade);
    if (options?.minScore !== undefined) params.append('minScore', options.minScore.toString());
    if (options?.maxScore !== undefined) params.append('maxScore', options.maxScore.toString());
    if (options?.sortBy) params.append('sortBy', options.sortBy);
    if (options?.sortOrder) params.append('sortOrder', options.sortOrder);
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    const query = params.toString() ? `?${params.toString()}` : '';

    return this.request<Array<{
      id: string;
      contactId: string;
      totalScore: number;
      engagementScore: number;
      behaviorScore: number;
      fitScore: number;
      grade: string | null;
      lastActivity: string | null;
      contact: {
        id: string;
        email: string | null;
        firstName: string | null;
        lastName: string | null;
        title: string | null;
        company: { id: string; name: string } | null;
      };
    }>>(`/api/lead-scoring/scores${query}`);
  }

  async getLeadScore(contactId: string) {
    return this.request<{
      contactId: string;
      totalScore: number;
      engagementScore: number;
      behaviorScore: number;
      fitScore: number;
      grade: string;
      scoreHistory: Array<{ date: string; score: number; change: number; reason: string }>;
      lastActivity: string | null;
      recentEvents?: Array<{
        id: string;
        eventType: string;
        scoreChange: number;
        reason: string;
        createdAt: string;
      }>;
    }>(`/api/lead-scoring/scores/${contactId}`);
  }

  async recordScoreEvent(contactId: string, eventType: string, metadata?: Record<string, unknown>) {
    return this.request<{ scoreChange: number; newTotalScore: number; newGrade: string }>('/api/lead-scoring/events', {
      method: 'POST',
      body: { contactId, eventType, metadata },
    });
  }

  async adjustLeadScore(contactId: string, scoreChange: number, reason: string) {
    return this.request<{ newTotalScore: number; newGrade: string }>('/api/lead-scoring/adjust', {
      method: 'POST',
      body: { contactId, scoreChange, reason },
    });
  }

  async getLeadScoringRules() {
    return this.request<Array<{
      id: string;
      name: string;
      description: string | null;
      eventType: string;
      scoreChange: number;
      conditions: Record<string, unknown> | null;
      decayDays: number | null;
      decayAmount: number | null;
      isActive: boolean;
      priority: number;
      createdAt: string;
    }>>('/api/lead-scoring/rules');
  }

  async createLeadScoringRule(data: {
    name: string;
    description?: string;
    eventType: string;
    scoreChange: number;
    conditions?: Record<string, unknown>;
    decayDays?: number;
    decayAmount?: number;
    isActive?: boolean;
    priority?: number;
  }) {
    return this.request<{ id: string }>('/api/lead-scoring/rules', {
      method: 'POST',
      body: data,
    });
  }

  async updateLeadScoringRule(id: string, data: {
    name?: string;
    description?: string;
    eventType?: string;
    scoreChange?: number;
    isActive?: boolean;
    priority?: number;
  }) {
    return this.request<{ message: string }>(`/api/lead-scoring/rules/${id}`, {
      method: 'PUT',
      body: data,
    });
  }

  async deleteLeadScoringRule(id: string) {
    return this.request<{ message: string }>(`/api/lead-scoring/rules/${id}`, { method: 'DELETE' });
  }

  async getLeadScoreDistribution() {
    return this.request<{
      distribution: Array<{ grade: string; min: number; color: string; label: string; count: number }>;
      totalScored: number;
      totalContacts: number;
      unscoredCount: number;
    }>('/api/lead-scoring/analytics/distribution');
  }

  async getLeadScoreEventTypes() {
    return this.request<Array<{
      type: string;
      category: string;
      description: string;
      defaultScore: number;
    }>>('/api/lead-scoring/event-types');
  }

  // ===========================================
  // Custom Fields
  // ===========================================

  async getCustomFields(entityType?: 'CONTACT' | 'COMPANY' | 'DEAL') {
    const query = entityType ? `?entityType=${entityType}` : '';
    return this.request<Array<{
      id: string;
      name: string;
      label: string;
      description: string | null;
      entityType: string;
      fieldType: string;
      isRequired: boolean;
      isUnique: boolean;
      options: Array<{ value: string; label: string; color?: string }> | null;
      defaultValue: string | null;
      validation: Record<string, unknown> | null;
      order: number;
      isVisible: boolean;
      showInList: boolean;
      showInForm: boolean;
      createdAt: string;
    }>>(`/api/custom-fields${query}`);
  }

  async createCustomField(data: {
    name: string;
    label: string;
    description?: string;
    entityType: 'CONTACT' | 'COMPANY' | 'DEAL';
    fieldType: string;
    isRequired?: boolean;
    isUnique?: boolean;
    options?: Array<{ value: string; label: string; color?: string }>;
    defaultValue?: string;
    order?: number;
    showInList?: boolean;
    showInForm?: boolean;
  }) {
    return this.request<{ id: string }>('/api/custom-fields', {
      method: 'POST',
      body: data,
    });
  }

  async updateCustomField(id: string, data: {
    label?: string;
    description?: string;
    fieldType?: string;
    isRequired?: boolean;
    options?: Array<{ value: string; label: string; color?: string }>;
    defaultValue?: string;
    order?: number;
    isVisible?: boolean;
    showInList?: boolean;
    showInForm?: boolean;
  }) {
    return this.request<{ message: string }>(`/api/custom-fields/${id}`, {
      method: 'PUT',
      body: data,
    });
  }

  async deleteCustomField(id: string) {
    return this.request<{ message: string }>(`/api/custom-fields/${id}`, { method: 'DELETE' });
  }

  async getCustomFieldValues(entityType: 'CONTACT' | 'COMPANY' | 'DEAL', entityId: string) {
    return this.request<Array<{
      fieldId: string;
      name: string;
      label: string;
      fieldType: string;
      value: unknown;
      options: unknown;
      isRequired: boolean;
    }>>(`/api/custom-fields/values/${entityType}/${entityId}`);
  }

  async setCustomFieldValue(fieldId: string, entityId: string, value: unknown) {
    return this.request<{ message: string }>(`/api/custom-fields/values/${fieldId}`, {
      method: 'PUT',
      body: { entityId, value },
    });
  }

  async bulkSetCustomFieldValues(entityId: string, values: Record<string, unknown>) {
    return this.request<{ message: string }>('/api/custom-fields/values/bulk', {
      method: 'PUT',
      body: { entityId, values },
    });
  }

  async getCustomFieldTypes() {
    return this.request<Array<{
      type: string;
      label: string;
      icon: string;
      hasOptions: boolean;
    }>>('/api/custom-fields/meta/field-types');
  }

  // ===========================================
  // ===========================================
  // Contact Queues (Smart Contacts)
  // ===========================================

  async getContactQueues() {
    return this.request<{
      queues: Array<{
        key: string;
        name: string;
        description: string;
        icon: string;
        color: string;
        priority: number;
        count: number;
      }>;
      totalContacts: number;
    }>('/api/contact-queues/queues');
  }

  async getContactQueueContacts(queueKey: string, params?: { cursor?: string; limit?: number; search?: string }) {
    const searchParams = new URLSearchParams();
    if (params?.cursor) searchParams.set('cursor', params.cursor);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.search) searchParams.set('search', params.search);
    
    const query = searchParams.toString();
    return this.request<{
      queue: {
        key: string;
        name: string;
        description: string;
        icon: string;
        color: string;
      };
      contacts: Array<{
        id: string;
        firstName: string | null;
        lastName: string | null;
        email: string | null;
        phone: string | null;
        title: string | null;
        timezone: string | null;
        linkedinUrl: string | null;
        avatarUrl: string | null;
        lastContactedAt: string | null;
        lastRepliedAt: string | null;
        status: string;
        company: { id: string; name: string; domain: string | null } | null;
        leadScore: { totalScore: number; grade: string | null } | null;
        localTime: string | null;
        isCallableNow: boolean;
        nextBestAction: {
          type: string;
          label: string;
          reason: string;
          urgent: boolean;
        };
        priorityScore: number;
        overdueTaskCount: number;
        dueTodayTaskCount: number;
      }>;
      nextCursor: string | null;
      hasMore: boolean;
    }>(`/api/contact-queues/queues/${queueKey}${query ? `?${query}` : ''}`);
  }

  async searchContactsQuick(query: string, limit = 20) {
    return this.request<Array<{
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
      phone: string | null;
      title: string | null;
      timezone: string | null;
      company: { id: string; name: string; domain: string | null } | null;
      leadScore: { totalScore: number; grade: string | null } | null;
      localTime: string | null;
      isCallableNow: boolean;
    }>>(`/api/contact-queues/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  }

  async markContactContacted(id: string, data?: { channel?: string; outcome?: string; nextActionAt?: string }) {
    return this.request<{ message: string }>(`/api/contact-queues/${id}/mark-contacted`, {
      method: 'POST',
      body: data,
    });
  }

  async startCallBlock(params?: { queueKey?: string; contactIds?: string[]; limit?: number }) {
    return this.request<{ contactIds: string[]; count: number }>('/api/contact-queues/start-call-block', {
      method: 'POST',
      body: params,
    });
  }

  async recalculateContactPriority(id: string) {
    return this.request<{ callPriority: number }>(`/api/contact-queues/${id}/recalculate`, {
      method: 'POST',
    });
  }

  // ===========================================
  // Work Queue (Work OS)
  // ===========================================

  async getWorkQueue(types?: string) {
    const query = types ? `?types=${types}` : '';
    return this.request<{
      items: Array<{
        id: string;
        type: 'EMAIL_REPLY_NEEDED' | 'LINKEDIN_REPLY_NEEDED' | 'CALL_NOW' | 'FOLLOW_UP_DUE' | 'SEQUENCE_STEP' | 'LINKEDIN_ACTION' | 'HOT_SIGNAL' | 'TASK';
        priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
        title: string;
        subtitle: string | null;
        reason: string;
        createdAt: string;
        dueAt: string | null;
        contactId: string | null;
        contactName: string | null;
        contactEmail: string | null;
        contactPhone: string | null;
        contactTitle: string | null;
        contactAvatarUrl: string | null;
        companyId: string | null;
        companyName: string | null;
        resourceType: string;
        resourceId: string;
        recommendedAction: string;
        actionUrl: string;
        canCall: boolean;
        canEmail: boolean;
        canLinkedIn: boolean;
        metadata: Record<string, unknown>;
      }>;
      stats: {
        total: number;
        urgent: number;
        high: number;
        byType: Record<string, number>;
      };
    }>(`/api/work/queue${query}`);
  }

  async getContactContext(contactId: string) {
    return this.request<{
      contact: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        email: string | null;
        phone: string | null;
        title: string | null;
        linkedinUrl: string | null;
        avatarUrl: string | null;
        timezone: string | null;
        status: string;
        lastContactedAt: string | null;
        lastRepliedAt: string | null;
      };
      company: { id: string; name: string; domain: string | null; industry: string | null } | null;
      leadScore: { totalScore: number; grade: string } | null;
      nextBestAction: { type: string; label: string; reason: string };
      tasks: Array<{ id: string; title: string; dueAt: string | null; type: string }>;
      sequences: Array<{ id: string; sequenceId: string; sequenceName: string; status: string; currentStep: number }>;
      linkedInCampaigns: Array<{ id: string; campaignId: string; campaignName: string; status: string; currentStep: number }>;
      recentActivity: Array<{ id: string; type: string; title: string; createdAt: string }>;
      emailThreads: Array<{ id: string; subject: string | null; snippet: string | null; unreadCount: number; lastMessageAt: string | null }>;
      linkedInMessages: Array<{ id: string; body: string | null; sentAt: string; isOutbound: boolean }>;
      dataRooms: Array<{ id: string; name: string; slug: string; status: string; lastViewedAt: string | null }>;
    }>(`/api/work/contact/${contactId}/context`);
  }

  async performWorkQuickAction(data: {
    workItemId: string;
    action: 'COMPLETE' | 'SNOOZE' | 'SKIP' | 'CALL' | 'EMAIL' | 'LINKEDIN';
    snoozeUntil?: string;
    notes?: string;
  }) {
    return this.request<{ message: string }>('/api/work/quick-action', {
      method: 'POST',
      body: data,
    });
  }

  async markContactTouched(contactId: string, data: {
    channel: 'CALL' | 'EMAIL' | 'LINKEDIN' | 'OTHER';
    outcome?: string;
    notes?: string;
  }) {
    return this.request<{ message: string }>(`/api/work/contact/${contactId}/touched`, {
      method: 'POST',
      body: data,
    });
  }

  // ===========================================
  // Generic Methods for dynamic routes
  // ===========================================

  async get<T = unknown>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', body });
  }

  async put<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body });
  }

  async delete<T = unknown>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }
}

export const api = new ApiClient(API_BASE);
export { ApiError };
