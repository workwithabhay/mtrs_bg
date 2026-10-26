import { describe, it, expect } from 'vitest';
import {
  addCalendarMonths,
  calculateTrialEnd,
  isLifetimeSentinel,
  LIFETIME_SENTINEL_DATE,
} from '../../../src/common/utils/calendar-math.js';

describe('Calendar Math & Boundary Handling Unit Tests', () => {
  describe('addCalendarMonths', () => {
    it('adds 1 calendar month in standard middle-of-month cases', () => {
      const start = new Date('2026-03-15T12:00:00.000Z');
      const end = addCalendarMonths(start, 1);
      expect(end.toISOString()).toBe('2026-04-15T12:00:00.000Z');
    });

    it('adds 5 calendar months for five-month packages with month-end clamping', () => {
      // Jan 31 + 5 months -> June has 30 days -> must clamp to June 30, not overflow to July
      const start = new Date('2026-01-31T10:00:00.000Z');
      const end = addCalendarMonths(start, 5);
      expect(end.getUTCFullYear()).toBe(2026);
      expect(end.getUTCMonth()).toBe(5); // June (0-indexed: 5)
      expect(end.getUTCDate()).toBe(30); // Clamped to last day of June
    });

    it('handles February leap year vs non-leap year clamping correctly', () => {
      // 2026 is non-leap year (28 days in Feb)
      const start2026 = new Date('2026-01-31T00:00:00.000Z');
      const end2026 = addCalendarMonths(start2026, 1);
      expect(end2026.getUTCMonth()).toBe(1); // Feb
      expect(end2026.getUTCDate()).toBe(28);

      // 2028 is leap year (29 days in Feb)
      const start2028 = new Date('2028-01-31T00:00:00.000Z');
      const end2028 = addCalendarMonths(start2028, 1);
      expect(end2028.getUTCMonth()).toBe(1); // Feb
      expect(end2028.getUTCDate()).toBe(29);
    });

    it('handles year-end wrap-around (e.g. October + 5 months = March next year)', () => {
      const start = new Date('2026-10-15T00:00:00.000Z');
      const end = addCalendarMonths(start, 5);
      expect(end.getUTCFullYear()).toBe(2027);
      expect(end.getUTCMonth()).toBe(2); // March
      expect(end.getUTCDate()).toBe(15);
    });
  });

  describe('calculateTrialEnd', () => {
    it('sets trial expiry to exactly 7 calendar days from start timestamp', () => {
      const start = new Date('2026-10-26T12:00:00.000Z');
      const end = calculateTrialEnd(start);
      const diffMs = end.getTime() - start.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      expect(diffDays).toBe(7);
      expect(end.toISOString()).toBe('2026-11-02T12:00:00.000Z');
    });
  });

  describe('LIFETIME_SENTINEL_DATE', () => {
    it('is recognized as lifetime access sentinel', () => {
      expect(isLifetimeSentinel(LIFETIME_SENTINEL_DATE)).toBe(true);
      expect(isLifetimeSentinel(new Date('2026-11-02T12:00:00.000Z'))).toBe(false);
    });
  });
});
