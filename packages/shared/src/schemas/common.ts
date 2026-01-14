// ===========================================
// Common Schemas
// ===========================================

import { z } from 'zod';

export const idSchema = z.string().uuid();

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const timestampSchema = z.object({
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Pagination = z.infer<typeof paginationSchema>;
