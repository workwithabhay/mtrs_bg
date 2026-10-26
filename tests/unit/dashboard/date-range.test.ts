import { describe, it, expect } from 'vitest';
import {
  resolveDateRange,
  generateDateSeries,
} from '../../../src/modules/dashboard/dashboard.validation.js';

describe('Dashboard Date Range & Series Unit Tests', () => {
  describe('resolveDateRange', () => {
    it('should default to 30 days when range is not specified', () => {
      const range = resolveDateRange();
      expect(range.days).toBe(30);
      expect(range.range).toBe('30d');
      expect(range.startDate.getTime()).toBeLessThan(range.endDate.getTime());
      const diffDays = Math.round(
        (range.endDate.getTime() - range.startDate.getTime()) / (24 * 60 * 60 * 1000),
      );
      expect(diffDays).toBe(30);
    });

    it('should calculate 7 days range correctly', () => {
      const range = resolveDateRange('7d');
      expect(range.days).toBe(7);
      expect(range.range).toBe('7d');
      const diffDays = Math.round(
        (range.endDate.getTime() - range.startDate.getTime()) / (24 * 60 * 60 * 1000),
      );
      expect(diffDays).toBe(7);
    });

    it('should calculate 90 days range correctly', () => {
      const range = resolveDateRange('90d');
      expect(range.days).toBe(90);
      expect(range.range).toBe('90d');
      const diffDays = Math.round(
        (range.endDate.getTime() - range.startDate.getTime()) / (24 * 60 * 60 * 1000),
      );
      expect(diffDays).toBe(90);
    });
  });

  describe('generateDateSeries', () => {
    it('should generate continuous sequence of YYYY-MM-DD dates in UTC without gaps', () => {
      const start = new Date(Date.UTC(2026, 9, 1)); // Oct 1, 2026
      const end = new Date(Date.UTC(2026, 9, 7)); // Oct 7, 2026
      const series = generateDateSeries(start, end);

      expect(series).toEqual([
        '2026-10-01',
        '2026-10-02',
        '2026-10-03',
        '2026-10-04',
        '2026-10-05',
        '2026-10-06',
        '2026-10-07',
      ]);
      expect(series.length).toBe(7);
    });

    it('should return a single day array if start and end dates fall on the same day', () => {
      const day = new Date(Date.UTC(2026, 9, 15, 12, 30));
      const series = generateDateSeries(day, day);
      expect(series).toEqual(['2026-10-15']);
    });
  });
});
