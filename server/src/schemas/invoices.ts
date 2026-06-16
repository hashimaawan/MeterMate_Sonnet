import { z } from 'zod';

export const invoiceSchema = z.object({
  sessionId: z.string().min(1, 'sessionId is required'),
  txnRef: z.string().min(1, 'txnRef is required'),
});

export type InvoiceRequest = z.infer<typeof invoiceSchema>;
