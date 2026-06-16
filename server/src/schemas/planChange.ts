import { z } from 'zod';

export const planChangeSchema = z.object({
  sessionId: z.string().min(1, 'sessionId is required'),
  txnRef: z.string().min(1, 'txnRef is required'),
  targetHandle: z.enum(['basic', 'pro'], {
    errorMap: () => ({ message: 'targetHandle must be "basic" or "pro"' }),
  }),
  timing: z.enum(['prorate', 'at-renewal'], {
    errorMap: () => ({ message: 'timing must be "prorate" or "at-renewal"' }),
  }),
});

export type PlanChangeRequest = z.infer<typeof planChangeSchema>;
