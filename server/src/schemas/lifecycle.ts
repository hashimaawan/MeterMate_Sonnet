import { z } from 'zod';

export const lifecycleSchema = z
  .object({
    sessionId: z.string().min(1, 'sessionId is required'),
    txnRef: z.string().min(1, 'txnRef is required'),
    action: z.enum(['pause', 'resume', 'cancel', 'reactivate'], {
      errorMap: () => ({
        message: 'action must be "pause", "resume", "cancel", or "reactivate"',
      }),
    }),
    cancelType: z.enum(['immediate', 'end-of-period']).optional(),
    reasonCode: z.string().optional(),
  })
  .refine((d) => d.action !== 'cancel' || d.cancelType != null, {
    message: 'cancelType ("immediate" or "end-of-period") is required when action is "cancel"',
    path: ['cancelType'],
  });

export type LifecycleRequest = z.infer<typeof lifecycleSchema>;
