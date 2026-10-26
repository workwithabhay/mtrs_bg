import { z } from 'zod';

export const checkoutSchema = z
  .object({
    planId: z
      .string()
      .trim()
      .min(1, 'planId is required')
      .max(50, 'planId cannot exceed 50 characters')
      .toLowerCase(),
    interval: z.enum(['monthly', 'five_month', 'yearly', 'package']).optional(),
    simulateSuccess: z.boolean().default(true),
  })
  .strict();

export const verifyPaymentSchema = z
  .object({
    orderId: z.string().trim().min(1, 'orderId is required'),
    paymentId: z.string().trim().min(1, 'paymentId is required'),
    signature: z.string().trim().min(1, 'signature is required'),
  })
  .strict();

export const redeemPromoSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, 'Promotional code is required')
      .max(30, 'Promotional code is too long'),
  })
  .strict();

export const cancelSubscriptionSchema = z
  .object({
    immediate: z.boolean().default(false),
  })
  .strict();

export const paymentHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;
export type RedeemPromoInput = z.infer<typeof redeemPromoSchema>;
export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionSchema>;
export type PaymentHistoryQuery = z.infer<typeof paymentHistoryQuerySchema>;
