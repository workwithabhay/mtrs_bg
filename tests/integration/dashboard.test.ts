import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import {
  setupTestDatabase,
  clearTestDatabase,
  teardownTestDatabase,
} from '../helpers/db-helper.js';
import { app } from '../../src/app.js';
import { authService } from '../../src/modules/auth/auth.service.js';
import { mockEmailProvider } from '../../src/integrations/email/mock-email.provider.js';
import { QrCampaign } from '../../src/modules/qr-campaigns/models/qr-campaign.model.js';
import { QrEvent } from '../../src/modules/qr-campaigns/models/qr-event.model.js';
import { Feedback } from '../../src/modules/feedbacks/models/feedback.model.js';
import { Customer } from '../../src/modules/feedbacks/models/customer.model.js';
import type {
  DailyTrendPoint,
  RatingsBreakdownItem,
  CampaignPerformanceItem,
} from '../../src/modules/dashboard/dashboard.types.js';
import type { Types } from 'mongoose';

describe('Owner Dashboard & Analytics Integration Tests (Phase 8)', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
    mockEmailProvider.clear();
  });

  async function createOwner(email: string, businessName: string) {
    await authService.requestSignupOtp({
      email,
      name: 'Owner Name',
      businessName,
      category: 'Dining',
      consentAccepted: true,
    });

    const otp = mockEmailProvider.getLatestOtpFor(email)!;
    const { user, business, rawSessionToken, csrfToken } = await authService.verifySignupOtp(
      { email, otp },
      { userAgent: 'test-agent' },
    );

    return { user, business, rawSessionToken, csrfToken };
  }

  async function seedAnalyticsData(businessId: Types.ObjectId) {
    // 1. Create two QR campaigns
    const campaign1 = new QrCampaign({
      businessId,
      title: 'Counter Stand',
      heading: 'How was your food?',
      publicToken: 'camp_token_1_' + Math.random().toString(36).substring(2, 8),
      scanCount: 15, // all-time scan count
      status: 'active',
    });
    await campaign1.save();

    const campaign2 = new QrCampaign({
      businessId,
      title: 'Patio Table',
      heading: 'Enjoying the patio?',
      publicToken: 'camp_token_2_' + Math.random().toString(36).substring(2, 8),
      scanCount: 5,
      status: 'inactive',
    });
    await campaign2.save();

    // 2. Create customer
    const customer = new Customer({
      businessId,
      name: 'Alice Consumer',
      email: 'alice@example.com',
      phone: '+15551234567',
      lastVisitedAt: new Date(),
    });
    await customer.save();

    // 3. Create feedbacks with known ratings and statuses
    // Feedback 1: 5 stars, status: 'new'
    const f1 = new Feedback({
      businessId,
      qrCampaignId: campaign1._id,
      customerId: customer._id,
      rating: 5,
      text: 'Superb dining experience with great attentive staff!',
      status: 'new',
      consentAccepted: true,
    });
    await f1.save();

    // Feedback 2: 4 stars, status: 'reviewed'
    const f2 = new Feedback({
      businessId,
      qrCampaignId: campaign1._id,
      customerId: customer._id,
      rating: 4,
      text: 'Good lunch overall, pizza took a bit longer than expected.',
      status: 'reviewed',
      consentAccepted: true,
    });
    await f2.save();

    // Feedback 3: 2 stars, status: 'resolved'
    const f3 = new Feedback({
      businessId,
      qrCampaignId: campaign2._id,
      customerId: customer._id,
      rating: 2,
      text: 'Very loud music and table was not properly wiped down.',
      status: 'resolved',
      consentAccepted: true,
    });
    await f3.save();

    // 4. Create QrEvent logs (scans and google review clicks)
    // 3 scans for campaign1
    await QrEvent.create([
      { businessId, campaignId: campaign1._id, eventType: 'scan' },
      { businessId, campaignId: campaign1._id, eventType: 'scan' },
      { businessId, campaignId: campaign1._id, eventType: 'scan' },
      // 1 scan for campaign2
      { businessId, campaignId: campaign2._id, eventType: 'scan' },
      // 2 google review clicks for campaign1
      { businessId, campaignId: campaign1._id, eventType: 'google_review_click' },
      { businessId, campaignId: campaign1._id, eventType: 'google_review_click' },
    ]);

    return { campaign1, campaign2, customer, f1, f2, f3 };
  }

  describe('Security & Authentication Enforcements', () => {
    it('should reject unauthenticated requests to all dashboard endpoints with 401', async () => {
      const endpoints = [
        '/api/v1/dashboard/summary',
        '/api/v1/dashboard/feedback-trends',
        '/api/v1/dashboard/ratings-breakdown',
        '/api/v1/dashboard/qr-performance',
        '/api/v1/dashboard/recent-feedback',
      ];

      for (const endpoint of endpoints) {
        const res = await request(app).get(endpoint);
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
      }
    });

    it('should enforce multi-tenant isolation: Owner A cannot see Owner B metrics', async () => {
      const ownerA = await createOwner('ownera@cafe.com', 'Cafe A');
      const ownerB = await createOwner('ownerb@bistro.com', 'Bistro B');

      // Seed data only for Owner A
      await seedAnalyticsData(ownerA.business._id);

      // Owner B accesses summary
      const resB = await request(app)
        .get('/api/v1/dashboard/summary')
        .set('Cookie', [`session=${ownerB.rawSessionToken}`]);

      expect(resB.status).toBe(200);
      expect(resB.body.success).toBe(true);
      // Owner B must see zero counts
      expect(resB.body.data.feedbacks.total).toBe(0);
      expect(resB.body.data.feedbacks.periodTotal).toBe(0);
      expect(resB.body.data.ratings.averageRating).toBe(0);
      expect(resB.body.data.engagement.periodScans).toBe(0);
      expect(resB.body.data.engagement.googleReviewClicks).toBe(0);

      // Owner A accesses summary
      const resA = await request(app)
        .get('/api/v1/dashboard/summary')
        .set('Cookie', [`session=${ownerA.rawSessionToken}`]);

      expect(resA.status).toBe(200);
      expect(resA.body.data.feedbacks.total).toBe(3);
    });
  });

  describe('GET /api/v1/dashboard/summary', () => {
    it('should return accurate metrics with known fixtures and semantic distinctions', async () => {
      const { business, rawSessionToken } = await createOwner('owner@summary.com', 'Summary Cafe');
      await seedAnalyticsData(business._id);

      const res = await request(app)
        .get('/api/v1/dashboard/summary?range=30d')
        .set('Cookie', [`session=${rawSessionToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data;

      // Period metadata
      expect(data.period.range).toBe('30d');
      expect(data.period.startDate).toBeDefined();
      expect(data.period.endDate).toBeDefined();

      // Feedbacks counts: 3 total, 1 new, 1 reviewed, 1 resolved
      expect(data.feedbacks.total).toBe(3);
      expect(data.feedbacks.periodTotal).toBe(3);
      expect(data.feedbacks.newCount).toBe(1);
      expect(data.feedbacks.reviewedCount).toBe(1);
      expect(data.feedbacks.resolvedCount).toBe(1);

      // Rating average: (5 + 4 + 2) / 3 = 11 / 3 = 3.67
      expect(data.ratings.totalRatings).toBe(3);
      expect(data.ratings.averageRating).toBe(3.67);

      // Engagement: all-time scans = 15 + 5 = 20
      expect(data.engagement.totalScansAllTime).toBe(20);
      // Period scans in QrEvent = 4
      expect(data.engagement.periodScans).toBe(4);
      // Google review link clicks in QrEvent = 2
      expect(data.engagement.googleReviewClicks).toBe(2);
      // Active campaigns = 1 (campaign1 is active, campaign2 is inactive)
      expect(data.engagement.activeCampaignsCount).toBe(1);

      // Explicit semantic notes
      expect(data.semanticNotes.scans).toContain('not unique visitors');
      expect(data.semanticNotes.googleReviewClicks).toContain('not verified published reviews');
    });

    it('should reject invalid date range parameter with 400', async () => {
      const { rawSessionToken } = await createOwner('owner-filter@test.com', 'Filter Cafe');

      const res = await request(app)
        .get('/api/v1/dashboard/summary?range=1year')
        .set('Cookie', [`session=${rawSessionToken}`]);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle completely empty business without errors or NaN', async () => {
      const { rawSessionToken } = await createOwner('empty@test.com', 'Empty Cafe');

      const res = await request(app)
        .get('/api/v1/dashboard/summary')
        .set('Cookie', [`session=${rawSessionToken}`]);

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.feedbacks.total).toBe(0);
      expect(data.feedbacks.periodTotal).toBe(0);
      expect(data.ratings.averageRating).toBe(0);
      expect(data.ratings.totalRatings).toBe(0);
      expect(data.engagement.periodScans).toBe(0);
      expect(data.engagement.googleReviewClicks).toBe(0);
      expect(data.engagement.activeCampaignsCount).toBe(0);
    });
  });

  describe('GET /api/v1/dashboard/feedback-trends', () => {
    it('should group daily counts and populate zero-event days across the date range', async () => {
      const { business, rawSessionToken } = await createOwner('trends@test.com', 'Trends Cafe');
      await seedAnalyticsData(business._id);

      const res = await request(app)
        .get('/api/v1/dashboard/feedback-trends?range=7d')
        .set('Cookie', [`session=${rawSessionToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const trends = res.body.data.trends;

      // 7d range spans at least 7 calendar days
      expect(trends.length).toBeGreaterThanOrEqual(7);

      // Check format of each point
      for (const pt of trends) {
        expect(pt.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(typeof pt.feedbackCount).toBe('number');
        expect(typeof pt.scanCount).toBe('number');
        expect(typeof pt.googleReviewClicks).toBe('number');
      }

      // Today's point should contain the 3 feedbacks created today
      const todayUtc = new Date().toISOString().split('T')[0];
      const todayPoint = trends.find((pt: DailyTrendPoint) => pt.date === todayUtc);
      expect(todayPoint).toBeDefined();
      expect(todayPoint!.feedbackCount).toBe(3);
      expect(todayPoint!.scanCount).toBe(4);
      expect(todayPoint!.googleReviewClicks).toBe(2);
      expect(todayPoint!.averageRating).toBe(3.67);
    });
  });

  describe('GET /api/v1/dashboard/ratings-breakdown', () => {
    it('should calculate accurate count and percentage distribution for 1-5 stars', async () => {
      const { business, rawSessionToken } = await createOwner('ratings@test.com', 'Ratings Cafe');
      await seedAnalyticsData(business._id);

      const res = await request(app)
        .get('/api/v1/dashboard/ratings-breakdown')
        .set('Cookie', [`session=${rawSessionToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data;

      expect(data.totalRatings).toBe(3);
      expect(data.averageRating).toBe(3.67);
      expect(data.breakdown.length).toBe(5);

      // Star 5: 1 count = 33.3%
      const star5 = data.breakdown.find((b: RatingsBreakdownItem) => b.star === 5);
      expect(star5.count).toBe(1);
      expect(star5.percentage).toBe(33.3);

      // Star 4: 1 count = 33.3%
      const star4 = data.breakdown.find((b: RatingsBreakdownItem) => b.star === 4);
      expect(star4.count).toBe(1);
      expect(star4.percentage).toBe(33.3);

      // Star 3: 0 count = 0%
      const star3 = data.breakdown.find((b: RatingsBreakdownItem) => b.star === 3);
      expect(star3.count).toBe(0);
      expect(star3.percentage).toBe(0);

      // Star 2: 1 count = 33.3%
      const star2 = data.breakdown.find((b: RatingsBreakdownItem) => b.star === 2);
      expect(star2.count).toBe(1);
      expect(star2.percentage).toBe(33.3);

      // Star 1: 0 count = 0%
      const star1 = data.breakdown.find((b: RatingsBreakdownItem) => b.star === 1);
      expect(star1.count).toBe(0);
      expect(star1.percentage).toBe(0);
    });
  });

  describe('GET /api/v1/dashboard/qr-performance', () => {
    it('should return per-campaign scans, feedbacks, and clicks within range', async () => {
      const { business, rawSessionToken } = await createOwner('qrperf@test.com', 'QR Perf Cafe');
      const { campaign1, campaign2 } = await seedAnalyticsData(business._id);

      const res = await request(app)
        .get('/api/v1/dashboard/qr-performance?range=30d')
        .set('Cookie', [`session=${rawSessionToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const campaigns = res.body.data.campaigns;

      expect(campaigns.length).toBe(2);

      // Find campaign1
      const c1Data = campaigns.find(
        (c: CampaignPerformanceItem) => c.campaignId === campaign1._id.toString(),
      );
      expect(c1Data).toBeDefined();
      expect(c1Data!.title).toBe('Counter Stand');
      expect(c1Data!.status).toBe('active');
      expect(c1Data!.totalScansAllTime).toBe(15);
      expect(c1Data!.periodScans).toBe(3);
      expect(c1Data!.periodFeedbacks).toBe(2); // f1 and f2 belong to campaign1
      expect(c1Data!.periodGoogleReviewClicks).toBe(2);

      // Find campaign2
      const c2Data = campaigns.find(
        (c: CampaignPerformanceItem) => c.campaignId === campaign2._id.toString(),
      );
      expect(c2Data).toBeDefined();
      expect(c2Data!.title).toBe('Patio Table');
      expect(c2Data!.status).toBe('inactive');
      expect(c2Data!.totalScansAllTime).toBe(5);
      expect(c2Data!.periodScans).toBe(1);
      expect(c2Data!.periodFeedbacks).toBe(1); // f3 belongs to campaign2
      expect(c2Data!.periodGoogleReviewClicks).toBe(0);
    });
  });

  describe('GET /api/v1/dashboard/recent-feedback', () => {
    it('should paginate recent feedbacks and strictly protect customer PII', async () => {
      const { business, rawSessionToken } = await createOwner('recent@test.com', 'Recent Cafe');
      await seedAnalyticsData(business._id);

      const res = await request(app)
        .get('/api/v1/dashboard/recent-feedback?page=1&limit=2')
        .set('Cookie', [`session=${rawSessionToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const feedbacks = res.body.data;

      // Pagination bounds
      expect(feedbacks.length).toBe(2);
      expect(res.body.meta.total).toBe(3);
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.limit).toBe(2);
      expect(res.body.meta.totalPages).toBe(2);

      // Verify privacy: NO email, NO phone, NO customerId
      for (const item of feedbacks) {
        expect(item.id).toBeDefined();
        expect(item.rating).toBeGreaterThanOrEqual(1);
        expect(item.rating).toBeLessThanOrEqual(5);
        expect(item.status).toBeDefined();
        expect(item.textPreview).toBeDefined();
        expect(item.hasText).toBe(true);
        expect(item.createdAt).toBeDefined();

        // STRICT PII CHECK
        const rawItem = item as Record<string, unknown>;
        expect(rawItem.customerEmail).toBeUndefined();
        expect(rawItem.customerPhone).toBeUndefined();
        expect(rawItem.email).toBeUndefined();
        expect(rawItem.phone).toBeUndefined();
        expect(rawItem.customerId).toBeUndefined();
      }

      // Check stringification to ensure zero leaked PII
      const jsonStr = JSON.stringify(res.body);
      expect(jsonStr).not.toContain('alice@example.com');
      expect(jsonStr).not.toContain('+15551234567');
    });

    it('should truncate excessively long customer text with ellipsis in preview', async () => {
      const { business, rawSessionToken } = await createOwner(
        'longtext@test.com',
        'Long Text Cafe',
      );
      const campaign = new QrCampaign({
        businessId: business._id,
        title: 'Main',
        heading: 'Test',
        publicToken: 'camp_long_' + Math.random().toString(36).substring(2, 8),
      });
      await campaign.save();

      const customer = new Customer({
        businessId: business._id,
        name: 'Reader',
        email: 'reader@test.com',
      });
      await customer.save();

      const longReviewText = 'This was an extraordinary visit. '.repeat(10); // ~330 chars
      const f = new Feedback({
        businessId: business._id,
        qrCampaignId: campaign._id,
        customerId: customer._id,
        rating: 5,
        text: longReviewText,
        consentAccepted: true,
      });
      await f.save();

      const res = await request(app)
        .get('/api/v1/dashboard/recent-feedback?limit=5')
        .set('Cookie', [`session=${rawSessionToken}`]);

      expect(res.status).toBe(200);
      const item = res.body.data[0];
      expect(item.textPreview.length).toBeLessThanOrEqual(150);
      expect(item.textPreview.endsWith('...')).toBe(true);
    });

    it('should reject limit greater than maximum 20 with 400', async () => {
      const { rawSessionToken } = await createOwner('limit@test.com', 'Limit Cafe');

      const res = await request(app)
        .get('/api/v1/dashboard/recent-feedback?limit=50')
        .set('Cookie', [`session=${rawSessionToken}`]);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
