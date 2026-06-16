import { z } from 'zod';

export const digestSchema = z.object({
  sessionId: z.string().min(1, 'sessionId is required'),
  txnRef: z.string().min(1, 'txnRef is required'),
});

export type DigestRequest = z.infer<typeof digestSchema>;
