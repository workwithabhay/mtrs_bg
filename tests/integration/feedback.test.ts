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
import { Business } from '../../src/modules/businesses/business.model.js';
import { QrCampaign } from '../../src/modules/qr-campaigns/models/qr-campaign.model.js';
import { Feedback } from '../../src/modules/feedbacks/models/feedback.model.js';
import { QrEvent } from '../../src/modules/qr-campaigns/models/qr-event.model.js';

describe('Public Feedback & Review Collection Integration Tests', () => {
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

  async function createOwnerWithCampaign(
    email: string,
    businessName: string,
    googleReviewUrl: string | null = 'https://g.page/r/test-business/review',
  ) {
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

    if (googleReviewUrl) {
      await Business.findByIdAndUpdate(business._id, { googleReviewUrl });
    }

    const campaign = new QrCampaign({
      businessId: business._id,
      title: 'Table 1 QR',
      heading: 'How was your dining experience?',
      description: 'Help us serve you better',
      publicToken: 'campaigntoken' + Math.random().toString(36).substring(2, 10),
      status: 'active',
    });
    await campaign.save();

    return { user, business, campaign, rawSessionToken, csrfToken };
  }

  describe('Public QR Campaign Resolution (GET /api/v1/public/qr/:token)', () => {
    it('should resolve active campaign with public business info and review policy compliance', async () => {
      const { campaign } = await createOwnerWithCampaign(
        'owner@bistro.com',
        'Bistro De Paris',
        'https://g.page/r/bistro-paris/review',
      );

      const res = await request(app).get(`/api/v1/public/qr/${campaign.publicToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.business.name).toBe('Bistro De Paris');
      expect(res.body.data.campaign.title).toBe('Table 1 QR');
      expect(res.body.data.campaign.heading).toBe('How was your dining experience?');
      expect(res.body.data.googleReviewUrl).toBe('https://g.page/r/bistro-paris/review');
      expect(res.body.data.feedbackQuestions).toBeInstanceOf(Array);
      expect(res.body.data.feedbackQuestions.length).toBeGreaterThan(0);

      // Verify no sensitive internal fields leak
      expect(res.body.data.businessId).toBeUndefined();
      expect(res.body.data._id).toBeUndefined();
      expect(res.body.data.ownerId).toBeUndefined();
    });

    it('should return 404 for an invalid or inactive token', async () => {
      const { campaign, rawSessionToken, csrfToken } = await createOwnerWithCampaign(
        'owner-inactive@test.com',
        'Inactive Cafe',
      );

      // Deactivate campaign
      await request(app)
        .post(`/api/v1/qr-campaigns/${campaign._id.toString()}/deactivate`)
        .set('Cookie', [`session=${rawSessionToken}`, `csrf_token=${csrfToken}`])
        .set('x-csrf-token', csrfToken);

      // Inactive campaign returns 404
      const res = await request(app).get(`/api/v1/public/qr/${campaign.publicToken}`);
      expect(res.status).toBe(404);

      // Nonexistent token returns 404
      const resNonExistent = await request(app).get('/api/v1/public/qr/nonexistenttoken123');
      expect(resNonExistent.status).toBe(404);
    });
  });

  describe('Feedback Submission & Review Policy (POST /api/v1/public/qr/:token/feedback)', () => {
    it('should submit a 5-star feedback and return Google review link without gating', async () => {
      const { campaign } = await createOwnerWithCampaign(
        'owner5star@bistro.com',
        'Bistro Five',
        'https://g.page/r/bistro-five/review',
      );

      const res = await request(app)
        .post(`/api/v1/public/qr/${campaign.publicToken}/feedback`)
        .send({
          rating: 5,
          customerName: 'Alice Baker',
          customerEmail: 'alice@example.com',
          customerPhone: '+1 (555) 019-2834',
          text: 'Superb food and prompt service!',
          consentAccepted: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.googleReviewUrl).toBe('https://g.page/r/bistro-five/review');
      expect(res.body.data.feedbackId).toBeDefined();

      // Verify stored in DB
      const stored = await Feedback.findById(res.body.data.feedbackId).populate('customerId');
      expect(stored).not.toBeNull();
      expect(stored!.rating).toBe(5);
      const customer = stored!.customerId as unknown as {
        name: string;
        email: string;
        phone: string;
      };
      expect(customer.name).toBe('Alice Baker');
      expect(customer.email).toBe('alice@example.com');
      expect(customer.phone).toBe('+15550192834');
    });

    it('should submit a 1-star feedback with EQUAL access to Google review option (No Review Gating)', async () => {
      const { campaign } = await createOwnerWithCampaign(
        'owner1star@bistro.com',
        'Bistro One',
        'https://g.page/r/bistro-one/review',
      );

      const res = await request(app)
        .post(`/api/v1/public/qr/${campaign.publicToken}/feedback`)
        .send({
          rating: 1,
          customerName: 'Disappointed Bob',
          customerEmail: 'bob@example.com',
          text: 'Wait time was too long.',
          consentAccepted: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      // Review policy check: Google review option must NOT be suppressed for 1-star ratings!
      expect(res.body.data.googleReviewUrl).toBe('https://g.page/r/bistro-one/review');
      expect(res.body.data.message).toBe(
        'Thank you for your feedback! Your response has been received.',
      );
    });

    it('should reject ratings outside the 1 to 5 range', async () => {
      const { campaign } = await createOwnerWithCampaign('owner-range@test.com', 'Range Test');

      const res0 = await request(app)
        .post(`/api/v1/public/qr/${campaign.publicToken}/feedback`)
        .send({
          rating: 0,
          customerName: 'Sam',
          customerEmail: 'sam@example.com',
          consentAccepted: true,
        });

      expect(res0.status).toBe(400);

      const res6 = await request(app)
        .post(`/api/v1/public/qr/${campaign.publicToken}/feedback`)
        .send({
          rating: 6,
          customerName: 'Sam',
          customerEmail: 'sam@example.com',
          consentAccepted: true,
        });

      expect(res6.status).toBe(400);
    });

    it('should reject submission when both email and phone are missing', async () => {
      const { campaign } = await createOwnerWithCampaign('owner-contact@test.com', 'Contact Test');

      const res = await request(app)
        .post(`/api/v1/public/qr/${campaign.publicToken}/feedback`)
        .send({
          rating: 4,
          customerName: 'Anonymous Andy',
          consentAccepted: true,
        });

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.error)).toContain('at least one contact method');
    });

    it('should accept valid phone-only submission', async () => {
      const { campaign } = await createOwnerWithCampaign('owner-phone@test.com', 'Phone Test');

      const res = await request(app)
        .post(`/api/v1/public/qr/${campaign.publicToken}/feedback`)
        .send({
          rating: 4,
          customerName: 'Phone Only User',
          customerPhone: '555-987-6543',
          consentAccepted: true,
        });

      expect(res.status).toBe(201);
    });

    it('should validate answers against configured questions and reject invalid option', async () => {
      const { campaign, business } = await createOwnerWithCampaign(
        'owner-q@test.com',
        'Question Test',
      );

      // Configure a single choice question
      await Business.findByIdAndUpdate(business._id, {
        'settings.feedbackQuestions': [
          {
            id: 'service_speed',
            label: 'Service speed?',
            type: 'single_choice',
            required: true,
            options: ['Fast', 'Normal', 'Slow'],
          },
        ],
      });

      // Submit invalid choice
      const resInvalid = await request(app)
        .post(`/api/v1/public/qr/${campaign.publicToken}/feedback`)
        .send({
          rating: 4,
          customerName: 'Charlie',
          customerEmail: 'charlie@test.com',
          answers: [{ questionId: 'service_speed', answer: 'Nonexistent Option' }],
          consentAccepted: true,
        });

      expect(resInvalid.status).toBe(400);
      expect(resInvalid.body.error.message).toContain('Invalid option');

      // Submit missing required question
      const resMissing = await request(app)
        .post(`/api/v1/public/qr/${campaign.publicToken}/feedback`)
        .send({
          rating: 4,
          customerName: 'Charlie',
          customerEmail: 'charlie@test.com',
          answers: [],
          consentAccepted: true,
        });

      expect(resMissing.status).toBe(400);
      expect(resMissing.body.error.message).toContain('Answer for required question');
    });

    it('should handle duplicate submissions within 60s idempotently', async () => {
      const { campaign } = await createOwnerWithCampaign('owner-dup@test.com', 'Duplicate Cafe');

      const payload = {
        rating: 5,
        customerName: 'Frequent Customer',
        customerEmail: 'repeat@customer.com',
        text: 'Always delicious!',
        consentAccepted: true,
      };

      const res1 = await request(app)
        .post(`/api/v1/public/qr/${campaign.publicToken}/feedback`)
        .send(payload);

      expect(res1.status).toBe(201);

      // Immediate second submission
      const res2 = await request(app)
        .post(`/api/v1/public/qr/${campaign.publicToken}/feedback`)
        .send(payload);

      expect(res2.status).toBe(201);
      expect(res2.body.data.feedbackId).toBe(res1.body.data.feedbackId);

      // Verify only 1 record exists in DB
      const count = await Feedback.countDocuments({
        customerId: (await Feedback.findById(res1.body.data.feedbackId))!.customerId,
      });
      expect(count).toBe(1);
    });
  });

  describe('Google Review Click Tracking (POST /api/v1/public/qr/:token/google-review-click)', () => {
    it('should record click event and return configured destination URL without open redirect', async () => {
      const { campaign } = await createOwnerWithCampaign(
        'owner-click@test.com',
        'Click Tracking Cafe',
        'https://g.page/r/click-cafe/review',
      );

      const res = await request(app)
        .post(`/api/v1/public/qr/${campaign.publicToken}/google-review-click`)
        .set('Referer', 'https://qr-feedback.app/landing')
        .send({ arbitraryRedirect: 'https://evil-phishing.com' }); // Should be ignored

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.destinationUrl).toBe('https://g.page/r/click-cafe/review');

      // Verify event was logged
      const event = await QrEvent.findOne({
        campaignId: campaign._id,
        eventType: 'google_review_click',
      });
      expect(event).not.toBeNull();
      expect(event!.metadata?.destinationUrl).toBe('https://g.page/r/click-cafe/review');
    });

    it('should return 400 if Google review URL is not configured', async () => {
      const { campaign } = await createOwnerWithCampaign(
        'owner-nourl@test.com',
        'No Google URL Cafe',
        null, // No Google Review URL
      );

      const res = await request(app).post(
        `/api/v1/public/qr/${campaign.publicToken}/google-review-click`,
      );
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Google review URL is not configured');
    });
  });

  describe('Internal Feedback APIs (GET /api/v1/feedback & PATCH status)', () => {
    it('should return 401 when request is unauthenticated', async () => {
      const res = await request(app).get('/api/v1/feedback');
      expect(res.status).toBe(401);
    });

    it('should list and filter feedbacks scoped to authenticated owner', async () => {
      const ownerA = await createOwnerWithCampaign('ownerA@feedback.com', 'Business A');
      const ownerB = await createOwnerWithCampaign('ownerB@feedback.com', 'Business B');

      // Submit 2 feedbacks for Business A (one 5-star, one 2-star)
      await request(app).post(`/api/v1/public/qr/${ownerA.campaign.publicToken}/feedback`).send({
        rating: 5,
        customerName: 'User 1',
        customerEmail: 'u1@test.com',
        consentAccepted: true,
      });

      await request(app).post(`/api/v1/public/qr/${ownerA.campaign.publicToken}/feedback`).send({
        rating: 2,
        customerName: 'User 2',
        customerEmail: 'u2@test.com',
        consentAccepted: true,
      });

      // Submit 1 feedback for Business B
      await request(app).post(`/api/v1/public/qr/${ownerB.campaign.publicToken}/feedback`).send({
        rating: 4,
        customerName: 'User 3',
        customerEmail: 'u3@test.com',
        consentAccepted: true,
      });

      // Owner A lists all feedback
      const resAllA = await request(app)
        .get('/api/v1/feedback')
        .set('Cookie', [`session=${ownerA.rawSessionToken}`]);

      expect(resAllA.status).toBe(200);
      expect(resAllA.body.data.length).toBe(2);
      expect(resAllA.body.meta.total).toBe(2);

      // Owner A filters by rating=5
      const res5A = await request(app)
        .get('/api/v1/feedback?rating=5')
        .set('Cookie', [`session=${ownerA.rawSessionToken}`]);

      expect(res5A.status).toBe(200);
      expect(res5A.body.data.length).toBe(1);
      expect(res5A.body.data[0].rating).toBe(5);

      // Owner B only sees 1 feedback
      const resB = await request(app)
        .get('/api/v1/feedback')
        .set('Cookie', [`session=${ownerB.rawSessionToken}`]);

      expect(resB.status).toBe(200);
      expect(resB.body.data.length).toBe(1);
    });

    it('should retrieve single feedback by ID', async () => {
      const { campaign, rawSessionToken } = await createOwnerWithCampaign(
        'owner-get@test.com',
        'Get Cafe',
      );

      const submitRes = await request(app)
        .post(`/api/v1/public/qr/${campaign.publicToken}/feedback`)
        .send({
          rating: 5,
          customerName: 'Detail User',
          customerEmail: 'detail@user.com',
          consentAccepted: true,
        });

      const feedbackId = submitRes.body.data.feedbackId;

      const getRes = await request(app)
        .get(`/api/v1/feedback/${feedbackId}`)
        .set('Cookie', [`session=${rawSessionToken}`]);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data._id).toBe(feedbackId);
      expect(getRes.body.data.customerId.name).toBe('Detail User');
    });

    it('should update feedback status to reviewed or resolved with CSRF protection', async () => {
      const { campaign, rawSessionToken, csrfToken } = await createOwnerWithCampaign(
        'owner-status@test.com',
        'Status Cafe',
      );

      const submitRes = await request(app)
        .post(`/api/v1/public/qr/${campaign.publicToken}/feedback`)
        .send({
          rating: 3,
          customerName: 'Status User',
          customerEmail: 'status@user.com',
          consentAccepted: true,
        });

      const feedbackId = submitRes.body.data.feedbackId;

      const patchRes = await request(app)
        .patch(`/api/v1/feedback/${feedbackId}/status`)
        .set('Cookie', [`session=${rawSessionToken}`, `csrf_token=${csrfToken}`])
        .set('x-csrf-token', csrfToken)
        .send({ status: 'reviewed' });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.status).toBe('reviewed');

      // Verify in DB
      const updated = await Feedback.findById(feedbackId);
      expect(updated!.status).toBe('reviewed');
    });

    it('should reject status updates with invalid values or mass assignment attempts', async () => {
      const { campaign, rawSessionToken, csrfToken } = await createOwnerWithCampaign(
        'owner-sec@test.com',
        'Security Cafe',
      );

      const submitRes = await request(app)
        .post(`/api/v1/public/qr/${campaign.publicToken}/feedback`)
        .send({
          rating: 2,
          customerName: 'Sec User',
          customerEmail: 'sec@user.com',
          consentAccepted: true,
        });

      const feedbackId = submitRes.body.data.feedbackId;

      // Attempt to tamper with rating and internal ownership
      const patchRes = await request(app)
        .patch(`/api/v1/feedback/${feedbackId}/status`)
        .set('Cookie', [`session=${rawSessionToken}`, `csrf_token=${csrfToken}`])
        .set('x-csrf-token', csrfToken)
        .send({ status: 'reviewed', rating: 5, businessId: '65f123456789abcdef012345' });

      expect(patchRes.status).toBe(400); // Strict schema rejects unknown fields
    });

    it('should enforce multi-tenant isolation and deny cross-tenant feedback access', async () => {
      const ownerA = await createOwnerWithCampaign('ownerA-iso@test.com', 'Iso A');
      const ownerB = await createOwnerWithCampaign('ownerB-iso@test.com', 'Iso B');

      const submitRes = await request(app)
        .post(`/api/v1/public/qr/${ownerA.campaign.publicToken}/feedback`)
        .send({
          rating: 5,
          customerName: 'Confidential User',
          customerEmail: 'conf@user.com',
          consentAccepted: true,
        });

      const feedbackIdA = submitRes.body.data.feedbackId;

      // Owner B attempts to GET Owner A's feedback
      const getResB = await request(app)
        .get(`/api/v1/feedback/${feedbackIdA}`)
        .set('Cookie', [`session=${ownerB.rawSessionToken}`]);

      expect(getResB.status).toBe(404);

      // Owner B attempts to update status of Owner A's feedback
      const patchResB = await request(app)
        .patch(`/api/v1/feedback/${feedbackIdA}/status`)
        .set('Cookie', [`session=${ownerB.rawSessionToken}`, `csrf_token=${ownerB.csrfToken}`])
        .set('x-csrf-token', ownerB.csrfToken)
        .send({ status: 'resolved' });

      expect(patchResB.status).toBe(404);
    });
  });
});
