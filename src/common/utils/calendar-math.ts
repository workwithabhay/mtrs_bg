/**
 * Calendar math utility for accurate subscription expiry and duration calculations.
 * Properly handles calendar-month boundaries, leap years, and month-end clamping
 * (e.g. Jan 31 + 1 month = Feb 28/29, Jan 31 + 5 months = Jun 30).
 */

export function addCalendarMonths(startDate: Date, months: number): Date {
  const result = new Date(startDate.getTime());
  const originalDay = result.getDate();

  // Move forward by specified number of months
  result.setMonth(result.getMonth() + months);

  // If day rolled over into the next month because target month has fewer days
  // (e.g. adding 1 month to Jan 31 produces March 2 or 3 in a 28-day Feb),
  // clamp to the last valid day of the target month by setting date to 0.
  const targetMonthIndex = (startDate.getMonth() + months) % 12;
  const normalizedTargetMonth = (targetMonthIndex + 12) % 12;

  if (result.getMonth() !== normalizedTargetMonth) {
    result.setDate(0);
  } else if (result.getDate() !== originalDay) {
    // Check if originalDay was clamped
    result.setDate(0);
  }

  return result;
}

/**
 * Seven-day trial end calculation.
 * Determistically adds exactly 7 days (7 * 24 * 60 * 60 * 1000 ms) to the server timestamp.
 */
export function calculateTrialEnd(startDate: Date): Date {
  return new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
}

/**
 * Sentinel date for lifetime-free promotional access (FREE4YOU).
 * Set to December 31, 2099 23:59:59.999 UTC.
 */
export const LIFETIME_SENTINEL_DATE = new Date('2099-12-31T23:59:59.999Z');

export function isLifetimeSentinel(date: Date): boolean {
  return date.getTime() >= LIFETIME_SENTINEL_DATE.getTime() - 1000 * 60 * 60 * 24;
}

