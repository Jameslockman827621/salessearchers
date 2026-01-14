// ===========================================
// Calendar Schemas
// ===========================================

import { z } from 'zod';

export const calendarProviderSchema = z.enum(['GOOGLE', 'MICROSOFT']);

export const oauthCallbackSchema = z.object({
  code: z.string(),
  state: z.string(),
  error: z.string().optional(),
});

export const calendarSyncOptionsSchema = z.object({
  fullSync: z.boolean().optional().default(false),
});

export type CalendarProvider = z.infer<typeof calendarProviderSchema>;
export type OAuthCallback = z.infer<typeof oauthCallbackSchema>;
export type CalendarSyncOptions = z.infer<typeof calendarSyncOptionsSchema>;
