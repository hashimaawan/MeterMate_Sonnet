import { z } from 'zod';

export const usageSchema = z.object({
  sessionId: z.string().min(1, 'sessionId is required'),
  txnRef: z.string().min(1, 'txnRef is required'),
  componentHandle: z.enum(['metermate-consulting-minutes', 'metermate-api-calls'], {
    errorMap: () => ({ message: 'componentHandle must be "metermate-consulting-minutes" or "metermate-api-calls"' }),
  }),
  quantity: z
    .number({ invalid_type_error: 'quantity must be a number' })
    .positive('quantity must be greater than 0'),
  memo: z.string().optional(),
  timestamp: z.string().optional(),
});

export type UsageRequest = z.infer<typeof usageSchema>;
