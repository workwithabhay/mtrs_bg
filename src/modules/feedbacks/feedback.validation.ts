import { z } from 'zod';

export const submitFeedbackSchema = z
  .object({
    rating: z
      .number({
        message: 'Rating is required and must be an integer between 1 and 5',
      })
      .int('Rating must be an integer')
      .min(1, 'Rating must be at least 1 star')
      .max(5, 'Rating cannot exceed 5 stars'),
    customerName: z
      .string()
      .trim()
      .min(2, 'Customer name must be at least 2 characters long')
      .max(100, 'Customer name cannot exceed 100 characters'),
    customerEmail: z
      .string()
      .trim()
      .toLowerCase()
      .email('Please provide a valid email address')
      .optional()
      .or(z.literal('')),
    customerPhone: z.string().trim().optional().or(z.literal('')),
    text: z
      .string()
      .trim()
      .max(2000, 'Feedback text cannot exceed 2000 characters')
      .nullable()
      .optional(),
    answers: z
      .array(
        z.object({
          questionId: z.string().trim().min(1, 'Question ID is required'),
          answer: z
            .string()
            .trim()
            .min(1, 'Answer cannot be empty')
            .max(1000, 'Answer is too long'),
        }),
      )
      .max(10, 'Cannot provide more than 10 question answers')
      .optional(),
    consentAccepted: z.boolean().refine((val) => val === true, {
      message: 'You must accept the privacy and consent notice to submit feedback',
    }),
  })
  .refine(
    (data) => {
      const hasEmail = Boolean(data.customerEmail && data.customerEmail.length > 0);
      const hasPhone = Boolean(data.customerPhone && data.customerPhone.length > 0);
      return hasEmail || hasPhone;
    },
    {
      message: 'Please provide at least one contact method: email address or phone number',
      path: ['customerEmail'],
    },
  );

export const listFeedbackQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  status: z.enum(['new', 'reviewed', 'resolved']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  sortBy: z.enum(['createdAt', 'rating']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const updateFeedbackStatusSchema = z
  .object({
    status: z.enum(['new', 'reviewed', 'resolved'], {
      message: "Status must be one of: 'new', 'reviewed', or 'resolved'",
    }),
  })
  .strict();

export const aiAssistanceSchema = z
  .object({
    draftText: z
      .string({
        message: 'Draft feedback text is required',
      })
      .trim()
      .min(10, 'Draft text must be at least 10 characters long')
      .max(2000, 'Draft text cannot exceed 2000 characters'),
    answers: z
      .array(
        z.object({
          questionId: z.string().trim().min(1, 'Question ID is required'),
          answer: z
            .string()
            .trim()
            .min(1, 'Answer cannot be empty')
            .max(1000, 'Answer cannot exceed 1000 characters'),
        }),
      )
      .max(10, 'Cannot provide more than 10 question answers')
      .optional(),
    mode: z.enum(['improve_clarity']).default('improve_clarity'),
  })
  .strict();

export const ownerAiAssistanceSchema = z
  .object({
    draftText: z
      .string({
        message: 'Draft feedback text is required',
      })
      .trim()
      .min(10, 'Draft text must be at least 10 characters long')
      .max(2000, 'Draft text cannot exceed 2000 characters'),
    action: z
      .enum(['fix_grammar', 'improve_clarity', 'make_concise', 'professional_tone'])
      .default('improve_clarity'),
  })
  .strict();

export const listCustomersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(100).optional(),
  sortBy: z.enum(['lastVisitedAt', 'createdAt', 'name']).default('lastVisitedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type SubmitFeedbackInput = z.infer<typeof submitFeedbackSchema>;
export type ListFeedbackQuery = z.infer<typeof listFeedbackQuerySchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type UpdateFeedbackStatusInput = z.infer<typeof updateFeedbackStatusSchema>;
export type AiAssistanceInput = z.infer<typeof aiAssistanceSchema>;
export type OwnerAiAssistanceInput = z.infer<typeof ownerAiAssistanceSchema>;

