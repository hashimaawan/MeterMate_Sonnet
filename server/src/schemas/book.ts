import { z } from 'zod';

export const bookSchema = z.object({
  sessionId: z.string().min(1, 'sessionId is required'),
  firstName: z.string().min(1, 'firstName is required'),
  lastName: z.string().min(1, 'lastName is required'),
  email: z.string().email('email must be a valid email address'),
  consultantId: z.string().min(1, 'consultantId is required'),
  productHandle: z.enum(['basic', 'pro'], {
    errorMap: () => ({ message: 'productHandle must be "basic" or "pro"' }),
  }),
  collectionMethod: z.enum(['automatic', 'remittance'], {
    errorMap: () => ({ message: 'collectionMethod must be "automatic" or "remittance"' }),
  }),
  couponCode: z.string().optional(),
});

export type BookRequest = z.infer<typeof bookSchema>;
