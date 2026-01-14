import { z } from 'zod';

// Email Connection Schemas
export const EmailConnectionSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  provider: z.enum(['GMAIL', 'OUTLOOK']),
  email: z.string().email(),
  displayName: z.string().nullable(),
  isActive: z.boolean(),
  dailySendLimit: z.number().int().positive().nullable(),
  dailySentCount: z.number().int().nonnegative(),
  lastSyncAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateEmailConnectionSchema = z.object({
  provider: z.enum(['GMAIL', 'OUTLOOK']),
  email: z.string().email(),
  displayName: z.string().optional(),
  dailySendLimit: z.number().int().positive().optional(),
});

// Email Thread Schemas
export const EmailThreadSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  emailConnectionId: z.string().uuid(),
  externalThreadId: z.string(),
  subject: z.string().nullable(),
  snippet: z.string().nullable(),
  participantEmails: z.array(z.string()),
  contactId: z.string().uuid().nullable(),
  dealId: z.string().uuid().nullable(),
  isStarred: z.boolean(),
  isArchived: z.boolean(),
  lastMessageAt: z.date().nullable(),
  messageCount: z.number().int().nonnegative(),
  unreadCount: z.number().int().nonnegative(),
  createdAt: z.date(),
  updatedAt: z.date(),
  // Include messages when fetching
  messages: z.array(z.lazy(() => EmailMessageSchema)).optional(),
});

// Email Message Schemas
export const EmailMessageSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  threadId: z.string().uuid(),
  externalMessageId: z.string(),
  sentFromConnectionId: z.string().uuid().nullable(),
  fromEmail: z.string().email(),
  fromName: z.string().nullable(),
  toEmails: z.array(z.string()),
  ccEmails: z.array(z.string()).nullable(),
  bccEmails: z.array(z.string()).nullable(),
  subject: z.string().nullable(),
  bodyHtml: z.string().nullable(),
  bodyText: z.string().nullable(),
  snippet: z.string().nullable(),
  sentAt: z.date().nullable(),
  receivedAt: z.date(),
  isOutbound: z.boolean(),
  isRead: z.boolean(),
  isStarred: z.boolean(),
  hasAttachments: z.boolean(),
  labels: z.array(z.string()),
  sequenceEnrollmentId: z.string().uuid().nullable(),
  sequenceStepId: z.string().uuid().nullable(),
  trackingId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const SendEmailSchema = z.object({
  connectionId: z.string().uuid(),
  to: z.array(z.string().email()),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().min(1),
  bodyHtml: z.string().optional(),
  bodyText: z.string().optional(),
  threadId: z.string().uuid().optional(), // For replies
  inReplyTo: z.string().optional(),
  contactId: z.string().uuid().optional(),
  dealId: z.string().uuid().optional(),
});

export const EmailTrackingEventSchema = z.object({
  id: z.string().uuid(),
  trackingId: z.string(),
  eventType: z.enum(['SENT', 'OPEN', 'CLICK', 'BOUNCE', 'UNSUBSCRIBE']),
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  linkUrl: z.string().nullable(),
  createdAt: z.date(),
});

// Sequence Schemas
export const SequenceSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  creatorId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED']),
  settings: z.object({
    timezone: z.string().optional(),
    sendWindow: z.object({
      startHour: z.number().int().min(0).max(23),
      endHour: z.number().int().min(0).max(23),
      daysOfWeek: z.array(z.number().int().min(0).max(6)),
    }).optional(),
    trackOpens: z.boolean().optional(),
    trackClicks: z.boolean().optional(),
    stopOnReply: z.boolean().optional(),
    stopOnBounce: z.boolean().optional(),
  }).nullable(),
  stats: z.object({
    enrolled: z.number().int().nonnegative().optional(),
    completed: z.number().int().nonnegative().optional(),
    replied: z.number().int().nonnegative().optional(),
    bounced: z.number().int().nonnegative().optional(),
    unsubscribed: z.number().int().nonnegative().optional(),
  }).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  // Include steps when fetching
  steps: z.array(z.lazy(() => SequenceStepSchema)).optional(),
});

export const CreateSequenceSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  settings: z.object({
    timezone: z.string().optional(),
    sendWindow: z.object({
      startHour: z.number().int().min(0).max(23).default(9),
      endHour: z.number().int().min(0).max(23).default(17),
      daysOfWeek: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
    }).optional(),
    trackOpens: z.boolean().default(true),
    trackClicks: z.boolean().default(true),
    stopOnReply: z.boolean().default(true),
    stopOnBounce: z.boolean().default(true),
  }).optional(),
});

export const UpdateSequenceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
  settings: z.object({
    timezone: z.string().optional(),
    sendWindow: z.object({
      startHour: z.number().int().min(0).max(23),
      endHour: z.number().int().min(0).max(23),
      daysOfWeek: z.array(z.number().int().min(0).max(6)),
    }).optional(),
    trackOpens: z.boolean().optional(),
    trackClicks: z.boolean().optional(),
    stopOnReply: z.boolean().optional(),
    stopOnBounce: z.boolean().optional(),
  }).optional(),
});

// Sequence Step Schemas
export const SequenceStepSchema = z.object({
  id: z.string().uuid(),
  sequenceId: z.string().uuid(),
  stepNumber: z.number().int().positive(),
  stepType: z.enum(['EMAIL', 'WAIT', 'CONDITION', 'TASK']),
  delayDays: z.number().int().nonnegative(),
  delayHours: z.number().int().nonnegative(),
  subject: z.string().nullable(),
  bodyHtml: z.string().nullable(),
  bodyText: z.string().nullable(),
  isEnabled: z.boolean(),
  stats: z.object({
    sent: z.number().int().nonnegative().optional(),
    opened: z.number().int().nonnegative().optional(),
    clicked: z.number().int().nonnegative().optional(),
    replied: z.number().int().nonnegative().optional(),
  }).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateSequenceStepSchema = z.object({
  stepNumber: z.number().int().positive(),
  stepType: z.enum(['EMAIL', 'WAIT', 'CONDITION', 'TASK']),
  delayDays: z.number().int().nonnegative().default(0),
  delayHours: z.number().int().nonnegative().default(0),
  subject: z.string().max(500).optional(),
  bodyHtml: z.string().optional(),
  bodyText: z.string().optional(),
  isEnabled: z.boolean().default(true),
});

export const UpdateSequenceStepSchema = z.object({
  stepNumber: z.number().int().positive().optional(),
  stepType: z.enum(['EMAIL', 'WAIT', 'CONDITION', 'TASK']).optional(),
  delayDays: z.number().int().nonnegative().optional(),
  delayHours: z.number().int().nonnegative().optional(),
  subject: z.string().max(500).nullable().optional(),
  bodyHtml: z.string().nullable().optional(),
  bodyText: z.string().nullable().optional(),
  isEnabled: z.boolean().optional(),
});

// Sequence Enrollment Schemas
export const SequenceEnrollmentSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  sequenceId: z.string().uuid(),
  contactId: z.string().uuid(),
  emailConnectionId: z.string().uuid(),
  enrolledById: z.string().uuid(),
  status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'REPLIED', 'BOUNCED', 'UNSUBSCRIBED', 'CANCELLED']),
  currentStepNumber: z.number().int().nonnegative(),
  currentStepId: z.string().uuid().nullable(),
  nextScheduledAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  variables: z.record(z.string()).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  // Related data
  contact: z.object({
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    email: z.string().nullable(),
    company: z.string().nullable(),
  }).optional(),
  sequence: z.object({ name: z.string() }).optional(),
});

export const CreateSequenceEnrollmentSchema = z.object({
  sequenceId: z.string().uuid(),
  contactId: z.string().uuid(),
  emailConnectionId: z.string().uuid(),
  variables: z.record(z.string()).optional(),
  startImmediately: z.boolean().default(true),
});

export const BulkEnrollSchema = z.object({
  sequenceId: z.string().uuid(),
  contactIds: z.array(z.string().uuid()).min(1).max(1000),
  emailConnectionId: z.string().uuid(),
  variables: z.record(z.string()).optional(),
});

export const UpdateSequenceEnrollmentSchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED']).optional(),
  variables: z.record(z.string()).optional(),
});

// Sequence Event Schemas
export const SequenceEventSchema = z.object({
  id: z.string().uuid(),
  enrollmentId: z.string().uuid(),
  eventType: z.enum(['ENROLLED', 'STEP_SENT', 'OPENED', 'CLICKED', 'REPLIED', 'BOUNCED', 'UNSUBSCRIBED', 'PAUSED', 'RESUMED', 'COMPLETED', 'CANCELLED']),
  stepNumber: z.number().int().nullable(),
  details: z.record(z.unknown()).nullable(),
  createdAt: z.date(),
});

// Type exports
export type EmailConnection = z.infer<typeof EmailConnectionSchema>;
export type CreateEmailConnection = z.infer<typeof CreateEmailConnectionSchema>;
export type EmailThread = z.infer<typeof EmailThreadSchema>;
export type EmailMessage = z.infer<typeof EmailMessageSchema>;
export type SendEmail = z.infer<typeof SendEmailSchema>;
export type EmailTrackingEvent = z.infer<typeof EmailTrackingEventSchema>;
export type Sequence = z.infer<typeof SequenceSchema>;
export type CreateSequence = z.infer<typeof CreateSequenceSchema>;
export type UpdateSequence = z.infer<typeof UpdateSequenceSchema>;
export type SequenceStep = z.infer<typeof SequenceStepSchema>;
export type CreateSequenceStep = z.infer<typeof CreateSequenceStepSchema>;
export type UpdateSequenceStep = z.infer<typeof UpdateSequenceStepSchema>;
export type SequenceEnrollment = z.infer<typeof SequenceEnrollmentSchema>;
export type CreateSequenceEnrollment = z.infer<typeof CreateSequenceEnrollmentSchema>;
export type BulkEnroll = z.infer<typeof BulkEnrollSchema>;
export type UpdateSequenceEnrollment = z.infer<typeof UpdateSequenceEnrollmentSchema>;
export type SequenceEvent = z.infer<typeof SequenceEventSchema>;

