// ===========================================
// Webhook Schemas
// ===========================================

import { z } from 'zod';

export const recallWebhookEventSchema = z.object({
  event: z.string(),
  data: z.object({
    bot_id: z.string(),
    status: z.string().optional(),
    status_changes: z.array(z.object({
      code: z.string(),
      message: z.string().optional(),
      created_at: z.string().optional(),
    })).optional(),
  }),
});

export type RecallWebhookEvent = z.infer<typeof recallWebhookEventSchema>;
