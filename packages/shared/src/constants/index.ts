// ===========================================
// Shared Constants
// ===========================================

export const AUDIT_ACTIONS = {
  // User actions
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',
  
  // Meeting actions
  MEETING_CREATED: 'meeting.created',
  MEETING_UPDATED: 'meeting.updated',
  MEETING_DELETED: 'meeting.deleted',
  MEETING_STARTED: 'meeting.started',
  MEETING_ENDED: 'meeting.ended',
  
  // Task actions
  TASK_CREATED: 'task.created',
  TASK_UPDATED: 'task.updated',
  TASK_DELETED: 'task.deleted',
  TASK_COMPLETED: 'task.completed',
  
  // Contact actions
  CONTACT_CREATED: 'contact.created',
  CONTACT_UPDATED: 'contact.updated',
  CONTACT_DELETED: 'contact.deleted',
  CONTACT_ENRICHED: 'contact.enriched',
  
  // Deal actions
  DEAL_CREATED: 'deal.created',
  DEAL_UPDATED: 'deal.updated',
  DEAL_DELETED: 'deal.deleted',
  DEAL_STAGE_CHANGED: 'deal.stage_changed',
  DEAL_WON: 'deal.won',
  DEAL_LOST: 'deal.lost',
  
  // Calendar actions
  CALENDAR_CONNECTED: 'calendar.connected',
  CALENDAR_DISCONNECTED: 'calendar.disconnected',
  CALENDAR_SYNCED: 'calendar.synced',
  
  // Settings actions
  SETTINGS_UPDATED: 'settings.updated',
} as const;

export const TASK_SOURCES = {
  MANUAL: 'manual',
  MEETING_INSIGHT: 'meeting_insight',
  EMAIL: 'email',
  AUTOMATION: 'automation',
} as const;

export const MEETING_PLATFORMS = {
  ZOOM: 'ZOOM',
  GOOGLE_MEET: 'GOOGLE_MEET',
  TEAMS: 'TEAMS',
  WEBEX: 'WEBEX',
  OTHER: 'OTHER',
} as const;

export const CALENDAR_PROVIDERS = {
  GOOGLE: 'GOOGLE',
  MICROSOFT: 'MICROSOFT',
} as const;

export const FEATURE_FLAGS = {
  MEETING_BOT: 'meeting_bot',
  AI_INSIGHTS: 'ai_insights',
  EMAIL_SEQUENCES: 'email_sequences',
  LINKEDIN_INTEGRATION: 'linkedin_integration',
  DATA_ENRICHMENT: 'data_enrichment',
} as const;
