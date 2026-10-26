import { z } from 'zod';

export const adminBusinessQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  query: z.string().trim().max(100).optional(),
  status: z.enum(['all', 'active', 'suspended', 'pending_verification']).default('all'),
});

export const adminSubscriptionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(['all', 'active', 'pending', 'cancelled', 'expired']).default('all'),
  planId: z.string().trim().optional(),
});

export const adminAuditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  action: z.string().trim().optional(),
  targetType: z.string().trim().optional(),
});

export const planLimitsSchema = z.object({
  maxCampaigns: z.number().int().min(1, 'maxCampaigns must be at least 1'),
  maxMonthlyScans: z.number().int().min(1, 'maxMonthlyScans must be at least 1'),
  aiAssistanceEnabled: z.boolean(),
});

export const createPlanSchema = z
  .object({
    planId: z
      .string()
      .trim()
      .min(2, 'planId must be at least 2 characters')
      .max(50, 'planId cannot exceed 50 characters')
      .toLowerCase()
      .regex(
        /^[a-z0-9_-]+$/,
        'planId may only contain lowercase alphanumeric characters, dashes, and underscores',
      ),
    name: z.string().trim().min(2, 'Plan name is required').max(100),
    description: z.string().trim().min(2, 'Description is required').max(500),
    price: z
      .number()
      .int()
      .min(0, 'Price must be a non-negative integer in minor units (paise/cents)'),
    currency: z.string().trim().toUpperCase().default('INR'),
    interval: z.enum(['monthly', 'yearly']).default('monthly'),
    isPublished: z.boolean().default(true),
    features: z.array(z.string().trim().min(1)).min(1, 'At least one feature is required'),
    limits: planLimitsSchema,
    sortOrder: z.number().int().default(0),
  })
  .strict();

export const updatePlanSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().min(2).max(500).optional(),
    price: z.number().int().min(0).optional(),
    currency: z.string().trim().toUpperCase().optional(),
    interval: z.enum(['monthly', 'yearly']).optional(),
    isPublished: z.boolean().optional(),
    features: z.array(z.string().trim().min(1)).min(1).optional(),
    limits: planLimitsSchema.partial().optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();

export const updateBusinessStatusSchema = z
  .object({
    status: z.enum(['active', 'suspended']),
    reason: z.string().trim().min(3, 'A reason is required for status changes').max(300),
  })
  .strict();

export const overrideSubscriptionSchema = z
  .object({
    currentPeriodEnd: z.string().datetime().optional(),
    status: z.enum(['active', 'pending', 'cancelled', 'expired']).optional(),
    reason: z.string().trim().min(3, 'A reason is required for manual overrides').max(300),
  })
  .strict();

export const retirePromotionSchema = z
  .object({
    gracePeriodDays: z.number().int().min(1).max(365).default(30),
    reason: z.string().trim().min(3, 'A reason is required to retire promotion').max(300),
  })
  .strict();

export const adminPaymentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(['all', 'pending', 'success', 'failed']).default('all'),
  provider: z.enum(['all', 'razorpay', 'mock', 'promo']).default('all'),
  query: z.string().trim().max(100).optional(),
});

export const adminWebhooksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  provider: z.string().trim().optional(),
  eventType: z.string().trim().optional(),
});

export type AdminBusinessQuery = z.infer<typeof adminBusinessQuerySchema>;
export type AdminSubscriptionQuery = z.infer<typeof adminSubscriptionQuerySchema>;
export type AdminAuditLogQuery = z.infer<typeof adminAuditLogQuerySchema>;
export type UpdateBusinessStatusInput = z.infer<typeof updateBusinessStatusSchema>;
export type OverrideSubscriptionInput = z.infer<typeof overrideSubscriptionSchema>;
export type RetirePromotionInput = z.infer<typeof retirePromotionSchema>;
export type AdminPaymentsQuery = z.infer<typeof adminPaymentsQuerySchema>;
export type AdminWebhooksQuery = z.infer<typeof adminWebhooksQuerySchema>;

