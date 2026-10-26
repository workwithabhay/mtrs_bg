import { z } from 'zod';
import type { DashboardDateRange, DateRangeInfo } from './dashboard.types.js';

export const dashboardFilterSchema = z.object({
  range: z.enum(['7d', '30d', '90d']).default('30d'),
});

export const recentFeedbackQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(20).default(5),
  status: z.enum(['new', 'reviewed', 'resolved']).optional(),
});

export type DashboardFilterQuery = z.infer<typeof dashboardFilterSchema>;
export type RecentFeedbackQuery = z.infer<typeof recentFeedbackQuerySchema>;

/**
 * Resolves a date range (7d, 30d, 90d) into standardized UTC start and end bounds.
 */
export function resolveDateRange(range: DashboardDateRange = '30d'): DateRangeInfo {
  const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;

  const endDate = new Date(); // Current timestamp

  // Calculate start date by going back N full days from now
  const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

  return {
    range,
    startDate,
    endDate,
    days,
  };
}

/**
 * Generates an array of ISO calendar date strings (YYYY-MM-DD) for all days in a range (inclusive).
 */
export function generateDateSeries(startDate: Date, endDate: Date): string[] {
  const dates: string[] = [];
  const current = new Date(
    Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()),
  );
  const end = new Date(
    Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()),
  );

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]!);
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}
