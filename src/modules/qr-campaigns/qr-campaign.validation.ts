import { z } from 'zod';

const HEX_COLOR_REGEX = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

const brandingSchema = z
  .object({
    primaryColor: z
      .string()
      .regex(HEX_COLOR_REGEX, 'Primary color must be a valid hex color code (e.g. #2563EB)')
      .optional(),
    backgroundColor: z
      .string()
      .regex(HEX_COLOR_REGEX, 'Background color must be a valid hex color code (e.g. #FFFFFF)')
      .optional(),
  })
  .strict();

export const createQrCampaignSchema = z
  .object({
    title: z
      .string()
      .min(1, 'Campaign title is required')
      .trim()
      .min(2, 'Title must be at least 2 characters')
      .max(100, 'Title cannot exceed 100 characters'),
    heading: z
      .string()
      .min(1, 'Heading is required')
      .trim()
      .min(2, 'Heading must be at least 2 characters')
      .max(120, 'Heading cannot exceed 120 characters'),
    description: z
      .string()
      .trim()
      .max(250, 'Description cannot exceed 250 characters')
      .optional()
      .or(z.literal('')),
    branding: brandingSchema.optional(),
  })
  .strict();

export const updateQrCampaignSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, 'Title must be at least 2 characters')
      .max(100, 'Title cannot exceed 100 characters')
      .optional(),
    heading: z
      .string()
      .trim()
      .min(2, 'Heading must be at least 2 characters')
      .max(120, 'Heading cannot exceed 120 characters')
      .optional(),
    description: z
      .string()
      .trim()
      .max(250, 'Description cannot exceed 250 characters')
      .nullable()
      .optional(),
    branding: brandingSchema.optional(),
  })
  .strict();

export const listQrCampaignsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(['active', 'inactive']).optional(),
});

export const exportQrQuerySchema = z.object({
  format: z.enum(['png', 'svg', 'pdf'], {
    message: "Invalid format. Supported export formats are 'png', 'svg', and 'pdf'.",
  }),
});

export type CreateQrCampaignInput = z.infer<typeof createQrCampaignSchema>;
export type UpdateQrCampaignInput = z.infer<typeof updateQrCampaignSchema>;
export type ListQrCampaignsQuery = z.infer<typeof listQrCampaignsQuerySchema>;
export type ExportQrQuery = z.infer<typeof exportQrQuerySchema>;
