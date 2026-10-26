import type { FeedbackStatus } from '../feedbacks/models/feedback.model.js';
import type { QrCampaignStatus } from '../qr-campaigns/models/qr-campaign.model.js';

export type DashboardDateRange = '7d' | '30d' | '90d';

export interface DateRangeInfo {
  range: DashboardDateRange;
  startDate: Date;
  endDate: Date;
  days: number;
}

export interface DashboardSummaryResponse {
  period: {
    range: DashboardDateRange;
    startDate: string;
    endDate: string;
  };
  feedbacks: {
    total: number;
    periodTotal: number;
    newCount: number;
    reviewedCount: number;
    resolvedCount: number;
  };
  ratings: {
    averageRating: number;
    totalRatings: number;
  };
  engagement: {
    totalScansAllTime: number;
    periodScans: number;
    googleReviewClicks: number;
    activeCampaignsCount: number;
  };
  semanticNotes: {
    scans: string;
    googleReviewClicks: string;
  };
}

export interface DailyTrendPoint {
  date: string; // YYYY-MM-DD
  feedbackCount: number;
  averageRating: number | null;
  scanCount: number;
  googleReviewClicks: number;
}

export interface FeedbackTrendsResponse {
  period: {
    range: DashboardDateRange;
    startDate: string;
    endDate: string;
  };
  trends: DailyTrendPoint[];
}

export interface RatingsBreakdownItem {
  star: number; // 1, 2, 3, 4, 5
  count: number;
  percentage: number;
}

export interface RatingsBreakdownResponse {
  period: {
    range: DashboardDateRange;
    startDate: string;
    endDate: string;
  };
  totalRatings: number;
  averageRating: number;
  breakdown: RatingsBreakdownItem[];
}

export interface CampaignPerformanceItem {
  campaignId: string;
  title: string;
  heading: string;
  status: QrCampaignStatus;
  publicToken: string;
  totalScansAllTime: number;
  periodScans: number;
  periodFeedbacks: number;
  periodGoogleReviewClicks: number;
  createdAt: Date;
}

export interface QrPerformanceResponse {
  period: {
    range: DashboardDateRange;
    startDate: string;
    endDate: string;
  };
  campaigns: CampaignPerformanceItem[];
}

export interface RecentFeedbackItem {
  id: string;
  rating: number;
  status: FeedbackStatus;
  textPreview: string | null;
  hasText: boolean;
  campaignTitle: string | null;
  createdAt: Date;
}

export interface RecentFeedbackResponse {
  feedbacks: RecentFeedbackItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
