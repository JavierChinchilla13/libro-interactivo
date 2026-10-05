import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  db: z.enum(['up', 'down']),
  uptimeSeconds: z.number().nonnegative(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
