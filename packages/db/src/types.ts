// ===========================================
// Re-export Prisma Types
// ===========================================

export type {
  Tenant,
  User,
  Membership,
  AuditLog,
  RecordingPolicy,
  CalendarConnection,
  CalendarEvent,
  Meeting,
  MeetingBotSession,
  MeetingAsset,
  MeetingTranscript,
  MeetingParticipant,
  MeetingInsight,
  WebhookEvent,
  Task,
  Company,
  Contact,
  Deal,
  DealContact,
  PipelineStage,
  // Email types
  EmailConnection,
  EmailThread,
  EmailMessage,
  EmailTrackingEvent,
  EmailSequence,
  SequenceStep,
  SequenceEnrollment,
  SequenceEvent,
  // Enrichment & Coaching
  EnrichmentJob,
  CoachingSession,
  CoachingFeedback,
  Activity,
  // Data Rooms
  DataRoom,
  DataRoomSection,
  DataRoomContent,
  DataRoomView,
  DataRoomContentView,
  DataRoomActionItem,
  // LinkedIn
  LinkedInAction,
  // Notifications
  Notification,
  NotificationPreference,
  // Team
  TeamInvitation,
  // Import/Export
  ImportJob,
  ExportJob,
  // AI Content
  GeneratedContent,
  // Saved Views
  SavedView,
  // Notes
  Note,
  // Workflow Automation
  WorkflowAutomation,
  WorkflowRun,
  // Templates
  Template,
  // Lead Scoring
  LeadScore,
  LeadScoringRule,
  LeadScoreEvent,
  // Custom Fields
  CustomField,
  CustomFieldValue,
} from '@prisma/client';

export {
  RecordingRuleType,
  MeetingStatus,
  MeetingPlatform,
  TaskStatus,
  TaskPriority,
  // Email enums
  SequenceStatus,
  StepType,
  EnrollmentStatus,
  // Enrichment enums
  EnrichmentEntityType,
  EnrichmentStatus,
  // Data Room enums
  DataRoomStatus,
  ContentType,
  // LinkedIn enums
  LinkedInActionType,
  LinkedInActionStatus,
  // Notification enums
  NotificationType,
  // Team enums
  InvitationStatus,
  // Import/Export enums
  ImportType,
  ImportStatus,
  ExportType,
  ExportStatus,
  // Generated Content enums
  GeneratedContentType,
  // Workflow Automation enums
  WorkflowTriggerType,
  WorkflowRunStatus,
  // Template enums
  TemplateType,
  // Custom Field enums
  CustomFieldEntity,
  CustomFieldType,
} from '@prisma/client';

