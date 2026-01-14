// ===========================================
// Shared Types
// ===========================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta?: {
    requestId?: string;
    timestamp?: string;
    pagination?: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  };
}

export interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
}

export interface Meeting {
  id: string;
  title: string | null;
  meetingUrl: string;
  platform: string;
  status: string;
  scheduledAt: Date | null;
  startedAt: Date | null;
  endedAt: Date | null;
  duration: number | null;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueAt: Date | null;
  completedAt: Date | null;
}

export interface CalendarEvent {
  id: string;
  title: string | null;
  startTime: Date;
  endTime: Date;
  meetingUrl: string | null;
  status: string;
}

export interface Contact {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
}

export interface Deal {
  id: string;
  name: string;
  value: number | null;
  stage: string;
  probability: number | null;
}
