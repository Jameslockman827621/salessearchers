// ===========================================
// Meeting Schemas
// ===========================================

import { z } from 'zod';

export const meetingPlatformSchema = z.enum(['ZOOM', 'GOOGLE_MEET', 'TEAMS', 'WEBEX', 'OTHER']);

export const meetingStatusSchema = z.enum([
  'SCHEDULED',
  'BOT_JOINING',
  'RECORDING',
  'PROCESSING',
  'READY',
  'FAILED',
  'CANCELLED',
]);

export const createMeetingSchema = z.object({
  meetingUrl: z.string().url('Invalid meeting URL'),
  title: z.string().max(255).optional(),
  scheduledAt: z.coerce.date().optional(),
});

export const updateMeetingSchema = z.object({
  title: z.string().max(255).optional(),
  status: meetingStatusSchema.optional(),
}).strict();

export const listMeetingsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: meetingStatusSchema.optional(),
  userId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;
export type UpdateMeetingInput = z.infer<typeof updateMeetingSchema>;
export type ListMeetingsQuery = z.infer<typeof listMeetingsQuerySchema>;
