import type { Types } from 'mongoose';
import { Feedback } from '../feedbacks/models/feedback.model.js';
import { QrCampaign } from '../qr-campaigns/models/qr-campaign.model.js';
import { QrEvent } from '../qr-campaigns/models/qr-event.model.js';
import {
  type DashboardDateRange,
  type DashboardSummaryResponse,
  type FeedbackTrendsResponse,
  type RatingsBreakdownResponse,
  type RatingsBreakdownItem,
  type QrPerformanceResponse,
  type CampaignPerformanceItem,
  type RecentFeedbackResponse,
  type RecentFeedbackItem,
} from './dashboard.types.js';
import {
  resolveDateRange,
  generateDateSeries,
  type RecentFeedbackQuery,
} from './dashboard.validation.js';

export class DashboardService {
  /**
   * Retrieves high-level business analytics summary for the selected period.
   * Strictly calculates from authentic platform data with semantic distinctions.
   */
  async getSummary(
    businessId: Types.ObjectId,
    range: DashboardDateRange = '30d',
  ): Promise<DashboardSummaryResponse> {
    const dateRange = resolveDateRange(range);

    const periodFilter = {
      businessId,
      createdAt: { $gte: dateRange.startDate, $lte: dateRange.endDate },
    };

    // Parallel aggregate queries for high performance
    const [
      totalAllTime,
      periodTotal,
      statusCountsRaw,
      ratingMetricsRaw,
      allTimeScansRaw,
      periodScans,
      periodGoogleReviewClicks,
      activeCampaignsCount,
    ] = await Promise.all([
      // 1. Total feedbacks all time
      Feedback.countDocuments({ businessId }),

      // 2. Total feedbacks in period
      Feedback.countDocuments(periodFilter),

      // 3. Status breakdown in period
      Feedback.aggregate<{ _id: string; count: number }>([
        { $match: periodFilter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      // 4. Rating metrics in period
      Feedback.aggregate<{ _id: null; avgRating: number; totalRatings: number }>([
        { $match: periodFilter },
        {
          $group: {
            _id: null,
            avgRating: { $avg: '$rating' },
            totalRatings: { $sum: 1 },
          },
        },
      ]),

      // 5. Total scans all time across campaigns
      QrCampaign.aggregate<{ _id: null; totalScans: number }>([
        { $match: { businessId } },
        { $group: { _id: null, totalScans: { $sum: '$scanCount' } } },
      ]),

      // 6. Period scans recorded in QrEvent
      QrEvent.countDocuments({
        businessId,
        eventType: 'scan',
        createdAt: { $gte: dateRange.startDate, $lte: dateRange.endDate },
      }),

      // 7. Period Google review link clicks recorded in QrEvent
      QrEvent.countDocuments({
        businessId,
        eventType: 'google_review_click',
        createdAt: { $gte: dateRange.startDate, $lte: dateRange.endDate },
      }),

      // 8. Active campaigns count
      QrCampaign.countDocuments({ businessId, status: 'active' }),
    ]);

    // Parse status counts
    let newCount = 0;
    let reviewedCount = 0;
    let resolvedCount = 0;

    for (const item of statusCountsRaw) {
      if (item._id === 'new') newCount = item.count;
      else if (item._id === 'reviewed') reviewedCount = item.count;
      else if (item._id === 'resolved') resolvedCount = item.count;
    }

    // Parse ratings
    const avgRatingRaw = ratingMetricsRaw[0]?.avgRating ?? 0;
    const totalRatings = ratingMetricsRaw[0]?.totalRatings ?? 0;
    const averageRating = totalRatings > 0 ? Math.round(avgRatingRaw * 100) / 100 : 0;

    // Parse all-time scans
    const totalScansAllTime = allTimeScansRaw[0]?.totalScans ?? 0;

    return {
      period: {
        range: dateRange.range,
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
      },
      feedbacks: {
        total: totalAllTime,
        periodTotal,
        newCount,
        reviewedCount,
        resolvedCount,
      },
      ratings: {
        averageRating,
        totalRatings,
      },
      engagement: {
        totalScansAllTime,
        periodScans,
        googleReviewClicks: periodGoogleReviewClicks,
        activeCampaignsCount,
      },
      semanticNotes: {
        scans: 'Raw QR scan events recorded by the platform (not unique visitors).',
        googleReviewClicks:
          'Raw clicks on the external Google Review link recorded by the platform (not verified published reviews on Google).',
      },
    };
  }

  /**
   * Generates daily time series trends for feedback, average rating, scans, and review link clicks.
   * Guarantees zero-event days are populated for uninterrupted visual charts.
   */
  async getFeedbackTrends(
    businessId: Types.ObjectId,
    range: DashboardDateRange = '30d',
  ): Promise<FeedbackTrendsResponse> {
    const dateRange = resolveDateRange(range);

    const [feedbackGroups, eventGroups] = await Promise.all([
      // Aggregate feedbacks by UTC calendar day
      Feedback.aggregate<{ _id: string; count: number; avgRating: number }>([
        {
          $match: {
            businessId,
            createdAt: { $gte: dateRange.startDate, $lte: dateRange.endDate },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' },
            },
            count: { $sum: 1 },
            avgRating: { $avg: '$rating' },
          },
        },
      ]),

      // Aggregate events by UTC calendar day and eventType
      QrEvent.aggregate<{ _id: { date: string; eventType: string }; count: number }>([
        {
          $match: {
            businessId,
            createdAt: { $gte: dateRange.startDate, $lte: dateRange.endDate },
          },
        },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
              eventType: '$eventType',
            },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    // Build lookup maps
    const feedbackMap = new Map<string, { count: number; avgRating: number }>();
    for (const fg of feedbackGroups) {
      feedbackMap.set(fg._id, { count: fg.count, avgRating: fg.avgRating });
    }

    const scanMap = new Map<string, number>();
    const clickMap = new Map<string, number>();
    for (const eg of eventGroups) {
      if (eg._id.eventType === 'scan') {
        scanMap.set(eg._id.date, eg.count);
      } else if (eg._id.eventType === 'google_review_click') {
        clickMap.set(eg._id.date, eg.count);
      }
    }

    // Generate zero-filled series for every day in range
    const calendarDays = generateDateSeries(dateRange.startDate, dateRange.endDate);
    const trends = calendarDays.map((dateStr) => {
      const fb = feedbackMap.get(dateStr);
      const scanCount = scanMap.get(dateStr) ?? 0;
      const googleReviewClicks = clickMap.get(dateStr) ?? 0;

      return {
        date: dateStr,
        feedbackCount: fb?.count ?? 0,
        averageRating: fb ? Math.round(fb.avgRating * 100) / 100 : null,
        scanCount,
        googleReviewClicks,
      };
    });

    return {
      period: {
        range: dateRange.range,
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
      },
      trends,
    };
  }

  /**
   * Retrieves star rating breakdown (1 to 5 stars) with counts and percentages.
   */
  async getRatingsBreakdown(
    businessId: Types.ObjectId,
    range: DashboardDateRange = '30d',
  ): Promise<RatingsBreakdownResponse> {
    const dateRange = resolveDateRange(range);

    const rawBreakdown = await Feedback.aggregate<{ _id: number; count: number }>([
      {
        $match: {
          businessId,
          createdAt: { $gte: dateRange.startDate, $lte: dateRange.endDate },
        },
      },
      {
        $group: {
          _id: '$rating',
          count: { $sum: 1 },
        },
      },
    ]);

    const countMap = new Map<number, number>();
    let totalRatings = 0;
    let weightedSum = 0;

    for (const row of rawBreakdown) {
      countMap.set(row._id, row.count);
      totalRatings += row.count;
      weightedSum += row._id * row.count;
    }

    // Build items for stars 1 through 5
    const breakdown: RatingsBreakdownItem[] = [1, 2, 3, 4, 5].map((star) => {
      const count = countMap.get(star) ?? 0;
      const percentage = totalRatings > 0 ? Math.round((count / totalRatings) * 1000) / 10 : 0;
      return { star, count, percentage };
    });

    const averageRating =
      totalRatings > 0 ? Math.round((weightedSum / totalRatings) * 100) / 100 : 0;

    return {
      period: {
        range: dateRange.range,
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
      },
      totalRatings,
      averageRating,
      breakdown,
    };
  }

  /**
   * Retrieves per-campaign performance metrics (period scans, period feedbacks, Google review clicks).
   */
  async getQrPerformance(
    businessId: Types.ObjectId,
    range: DashboardDateRange = '30d',
  ): Promise<QrPerformanceResponse> {
    const dateRange = resolveDateRange(range);

    const [campaigns, eventAggs, feedbackAggs] = await Promise.all([
      // 1. All tenant campaigns
      QrCampaign.find({ businessId }).sort({ createdAt: -1 }),

      // 2. Events grouped by campaign and eventType
      QrEvent.aggregate<{ _id: { campaignId: Types.ObjectId; eventType: string }; count: number }>([
        {
          $match: {
            businessId,
            createdAt: { $gte: dateRange.startDate, $lte: dateRange.endDate },
          },
        },
        {
          $group: {
            _id: { campaignId: '$campaignId', eventType: '$eventType' },
            count: { $sum: 1 },
          },
        },
      ]),

      // 3. Feedbacks grouped by qrCampaignId
      Feedback.aggregate<{ _id: Types.ObjectId; count: number }>([
        {
          $match: {
            businessId,
            createdAt: { $gte: dateRange.startDate, $lte: dateRange.endDate },
          },
        },
        {
          $group: {
            _id: '$qrCampaignId',
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    // Build lookup maps
    const scansMap = new Map<string, number>();
    const clicksMap = new Map<string, number>();
    for (const eg of eventAggs) {
      const cId = eg._id.campaignId.toString();
      if (eg._id.eventType === 'scan') {
        scansMap.set(cId, eg.count);
      } else if (eg._id.eventType === 'google_review_click') {
        clicksMap.set(cId, eg.count);
      }
    }

    const feedbacksMap = new Map<string, number>();
    for (const fg of feedbackAggs) {
      if (fg._id) {
        feedbacksMap.set(fg._id.toString(), fg.count);
      }
    }

    const performanceItems: CampaignPerformanceItem[] = campaigns.map((camp) => {
      const cId = camp._id.toString();
      return {
        campaignId: cId,
        title: camp.title,
        heading: camp.heading,
        status: camp.status,
        publicToken: camp.publicToken,
        totalScansAllTime: camp.scanCount,
        periodScans: scansMap.get(cId) ?? 0,
        periodFeedbacks: feedbacksMap.get(cId) ?? 0,
        periodGoogleReviewClicks: clicksMap.get(cId) ?? 0,
        createdAt: camp.createdAt,
      };
    });

    return {
      period: {
        range: dateRange.range,
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
      },
      campaigns: performanceItems,
    };
  }

  /**
   * Retrieves paginated recent feedback submissions formatted for the owner dashboard.
   * Strictly omits customer contact details (email, phone, PII) and bounds text preview.
   */
  async getRecentFeedback(
    businessId: Types.ObjectId,
    query: RecentFeedbackQuery,
  ): Promise<RecentFeedbackResponse> {
    const filter: Record<string, unknown> = { businessId };
    if (query.status) {
      filter.status = query.status;
    }

    const skip = (query.page - 1) * query.limit;

    const [docs, total] = await Promise.all([
      Feedback.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .populate<{ qrCampaignId: { title?: string } | null }>('qrCampaignId', 'title')
        .select('_id rating status text createdAt qrCampaignId'),
      Feedback.countDocuments(filter),
    ]);

    const feedbacks: RecentFeedbackItem[] = docs.map((doc) => {
      const rawText = doc.text ? doc.text.trim() : null;
      let textPreview: string | null = null;
      if (rawText) {
        textPreview = rawText.length > 150 ? `${rawText.slice(0, 147)}...` : rawText;
      }

      return {
        id: doc._id.toString(),
        rating: doc.rating,
        status: doc.status,
        textPreview,
        hasText: Boolean(rawText && rawText.length > 0),
        campaignTitle: doc.qrCampaignId?.title || null,
        createdAt: doc.createdAt,
      };
    });

    return {
      feedbacks,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    };
  }
}

export const dashboardService = new DashboardService();
