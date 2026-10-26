import { z } from 'zod';

const HEX_COLOR_REGEX = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

const brandingUpdateSchema = z
  .object({
    primaryColor: z
      .string()
      .regex(HEX_COLOR_REGEX, 'Primary color must be a valid hex color code (e.g. #2563EB)')
      .optional(),
    secondaryColor: z
      .string()
      .regex(HEX_COLOR_REGEX, 'Secondary color must be a valid hex color code (e.g. #1E293B)')
      .optional(),
  })
  .strict();

export const updateBusinessProfileSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Business name must be at least 2 characters')
      .max(120, 'Business name cannot exceed 120 characters')
      .optional(),
    category: z
      .string()
      .trim()
      .min(2, 'Category must be at least 2 characters')
      .max(80, 'Category cannot exceed 80 characters')
      .optional(),
    googleReviewUrl: z
      .string()
      .trim()
      .url('Google review URL must be a valid HTTP or HTTPS URL')
      .nullable()
      .optional()
      .or(z.literal('')),
    googlePlaceId: z.string().trim().nullable().optional(),
    branding: brandingUpdateSchema.optional(),
  })
  .strict();

export const updateBusinessSettingsSchema = z
  .object({
    defaultLanguage: z
      .enum(['en'], {
        message: "Only 'en' (English) is currently supported as default language",
      })
      .optional(),
    allowPublicReviews: z.boolean().optional(),
    notificationEmail: z
      .string()
      .trim()
      .toLowerCase()
      .email('Please provide a valid notification email address')
      .nullable()
      .optional()
      .or(z.literal('')),
    headingText: z
      .string()
      .trim()
      .max(120, 'Heading text cannot exceed 120 characters')
      .nullable()
      .optional(),
    subheadingText: z
      .string()
      .trim()
      .max(250, 'Subheading text cannot exceed 250 characters')
      .nullable()
      .optional(),
    feedbackQuestions: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(50),
            label: z.string().trim().min(1).max(150),
            type: z.enum(['text', 'long_text', 'single_choice']),
            required: z.boolean().default(false),
            options: z.array(z.string().trim().min(1).max(50)).max(10).optional(),
          })
          .strict(),
      )
      .max(10, 'Cannot configure more than 10 feedback questions')
      .optional(),
  })
  .strict();

export type UpdateBusinessProfileInput = z.infer<typeof updateBusinessProfileSchema>;
export type UpdateBusinessSettingsInput = z.infer<typeof updateBusinessSettingsSchema>;
