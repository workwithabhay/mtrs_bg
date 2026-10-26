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
import { Subscription } from '../../src/modules/billing/models/subscription.model.js';
import { PaymentEvent } from '../../src/modules/billing/models/payment-event.model.js';
import { Plan, seedDefaultPlans } from '../../src/modules/billing/models/plan.model.js';

describe('Billing & Subscription Integration Tests (Phase 9)', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
    mockEmailProvider.clear();
    await seedDefaultPlans();
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

  describe('GET /api/v1/billing/plans', () => {
    it('returns published active plans in public response', async () => {
      // Add an unpublished plan to verify it is omitted
      await Plan.create({
        planId: 'legacy-enterprise',
        name: 'Legacy Enterprise',
        description: 'Unpublished plan',
        price: 999900,
        currency: 'INR',
        interval: 'monthly',
        isPublished: false,
        features: ['Dedicated rep'],
        limits: { maxCampaigns: 100, maxMonthlyScans: 50000, aiAssistanceEnabled: true },
      });

      const res = await request(app).get('/api/v1/billing/plans');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      const planIds = res.body.data.map((p: { planId: string }) => p.planId);
      expect(planIds).toContain('monthly');
      expect(planIds).toContain('five_month');
      expect(planIds).not.toContain('legacy-enterprise');

      const monthly = res.body.data.find((p: { planId: string }) => p.planId === 'monthly');
      expect(monthly.price).toBe(9900);
      expect(monthly.currency).toBe('INR');
      expect(monthly.features).toBeInstanceOf(Array);

      const fiveMonth = res.body.data.find((p: { planId: string }) => p.planId === 'five_month');
      expect(fiveMonth.price).toBe(39900);
      expect(fiveMonth.currency).toBe('INR');
    });
  });

  describe('Authentication & Authorization Guards', () => {
    it('rejects unauthenticated requests to billing endpoints with 401', async () => {
      const endpoints = [
        { method: 'get', url: '/api/v1/billing/subscription' },
        { method: 'post', url: '/api/v1/billing/subscription/checkout' },
        { method: 'post', url: '/api/v1/billing/subscription/cancel' },
        { method: 'get', url: '/api/v1/billing/payment-history' },
      ];

      for (const endpoint of endpoints) {
        let req;
        if (endpoint.method === 'get') {
          req = request(app).get(endpoint.url);
        } else {
          req = request(app).post(endpoint.url);
        }
        const res = await req;
        expect(res.status).toBe(401);
      }
    });
  });

  describe('GET /api/v1/billing/subscription', () => {
    it('returns default active 7-day free trial for a newly created business', async () => {
      const owner = await createOwner('owner-new@test.com', 'New Business');

      const res = await request(app)
        .get('/api/v1/billing/subscription')
        .set('Cookie', [`session=${owner.rawSessionToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.planId).toBe('trial');
      expect(res.body.data.status).toBe('active');
      expect(res.body.data.entitlementStatus).toBe('trial_active');
      expect(res.body.data.canAccessProduct).toBe(true);
      expect(res.body.data.priceSnapshot.amount).toBe(0);
      expect(res.body.data.trialEndsAt).toBeDefined();
    });
  });

  describe('POST /api/v1/billing/subscription/checkout', () => {
    it('rejects client attempt to inject arbitrary price or status', async () => {
      const owner = await createOwner('owner-tamper@test.com', 'Tamper Business');

      const res = await request(app)
        .post('/api/v1/billing/subscription/checkout')
        .set('Cookie', [`session=${owner.rawSessionToken}`, `csrf_token=${owner.csrfToken}`])
        .set('X-CSRF-Token', owner.csrfToken)
        .send({
          planId: 'starter',
          price: 0, // Client tries to pay 0 for starter
          status: 'active',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects invalid or unpublished plan ID', async () => {
      const owner = await createOwner('owner-invalid-plan@test.com', 'Invalid Plan Business');

      const res = await request(app)
        .post('/api/v1/billing/subscription/checkout')
        .set('Cookie', [`session=${owner.rawSessionToken}`, `csrf_token=${owner.csrfToken}`])
        .set('X-CSRF-Token', owner.csrfToken)
        .send({
          planId: 'non_existent_plan',
          interval: 'monthly',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/invalid or currently unavailable/i);
    });

    it('successfully processes simulated mock checkout and creates payment event', async () => {
      const owner = await createOwner('owner-checkout@test.com', 'Checkout Business');

      const res = await request(app)
        .post('/api/v1/billing/subscription/checkout')
        .set('Cookie', [`session=${owner.rawSessionToken}`, `csrf_token=${owner.csrfToken}`])
        .set('X-CSRF-Token', owner.csrfToken)
        .send({
          planId: 'monthly',
          interval: 'monthly',
          simulateSuccess: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('succeeded');
      expect(res.body.data.isSimulated).toBe(true);
      expect(res.body.data.subscription).toBeDefined();
      expect(res.body.data.subscription.planId).toBe('monthly');
      expect(res.body.data.subscription.status).toBe('active');
      expect(res.body.data.subscription.priceSnapshot.amount).toBe(9900);

      // Verify database records
      const subscriptionInDb = await Subscription.findOne({ businessId: owner.business._id });
      expect(subscriptionInDb).toBeDefined();
      expect(subscriptionInDb?.status).toBe('active');
      expect(subscriptionInDb?.planId).toBe('monthly');

      const paymentEvent = await PaymentEvent.findOne({ businessId: owner.business._id });
      expect(paymentEvent).toBeDefined();
      expect(paymentEvent?.eventType).toBe('payment.succeeded');
      expect(paymentEvent?.status).toBe('success');
      expect(paymentEvent?.isSimulated).toBe(true);
      expect(paymentEvent?.provider).toBe('mock');
      expect(paymentEvent?.amount).toBe(9900);
    });

    it('does not activate subscription when simulated checkout fails', async () => {
      const owner = await createOwner('owner-fail-pay@test.com', 'Fail Pay Business');

      const res = await request(app)
        .post('/api/v1/billing/subscription/checkout')
        .set('Cookie', [`session=${owner.rawSessionToken}`, `csrf_token=${owner.csrfToken}`])
        .set('X-CSRF-Token', owner.csrfToken)
        .send({
          planId: 'monthly',
          interval: 'monthly',
          simulateSuccess: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('failed');
      expect(res.body.data.isSimulated).toBe(true);

      // Subscription should NOT have been activated to monthly (remains trial)
      const sub = await Subscription.findOne({ businessId: owner.business._id });
      expect(sub).toBeDefined();
      expect(sub?.planId).toBe('trial');

      // Failed payment event should be recorded
      const failedEvent = await PaymentEvent.findOne({
        businessId: owner.business._id,
        eventType: 'payment.failed',
      });
      expect(failedEvent).toBeDefined();
      expect(failedEvent?.status).toBe('failed');
      expect(failedEvent?.isSimulated).toBe(true);
    });
  });

  describe('POST /api/v1/billing/subscription/cancel', () => {
    it('cancels an active subscription immediately when requested', async () => {
      const owner = await createOwner('owner-cancel-imm@test.com', 'Cancel Imm Business');

      // First subscribe
      await request(app)
        .post('/api/v1/billing/subscription/checkout')
        .set('Cookie', [`session=${owner.rawSessionToken}`, `csrf_token=${owner.csrfToken}`])
        .set('X-CSRF-Token', owner.csrfToken)
        .send({
          planId: 'monthly',
          interval: 'monthly',
        });

      // Now cancel immediately
      const cancelRes = await request(app)
        .post('/api/v1/billing/subscription/cancel')
        .set('Cookie', [`session=${owner.rawSessionToken}`, `csrf_token=${owner.csrfToken}`])
        .set('X-CSRF-Token', owner.csrfToken)
        .send({
          immediate: true,
        });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.success).toBe(true);
      expect(cancelRes.body.data.status).toBe('cancelled');
      expect(cancelRes.body.data.cancelledAt).toBeDefined();

      const subInDb = await Subscription.findOne({ businessId: owner.business._id });
      expect(subInDb?.status).toBe('cancelled');

      // Idempotency: repeating cancellation returns success without duplicate errors
      const repeatRes = await request(app)
        .post('/api/v1/billing/subscription/cancel')
        .set('Cookie', [`session=${owner.rawSessionToken}`, `csrf_token=${owner.csrfToken}`])
        .set('X-CSRF-Token', owner.csrfToken)
        .send({ immediate: true });

      expect(repeatRes.status).toBe(200);
      expect(repeatRes.body.data.status).toBe('cancelled');
    });

    it('sets cancelAtPeriodEnd flag when immediate is false', async () => {
      const owner = await createOwner('owner-cancel-end@test.com', 'Cancel End Business');

      // Subscribe first
      await request(app)
        .post('/api/v1/billing/subscription/checkout')
        .set('Cookie', [`session=${owner.rawSessionToken}`, `csrf_token=${owner.csrfToken}`])
        .set('X-CSRF-Token', owner.csrfToken)
        .send({
          planId: 'pro',
          interval: 'monthly',
        });

      // Cancel at period end
      const cancelRes = await request(app)
        .post('/api/v1/billing/subscription/cancel')
        .set('Cookie', [`session=${owner.rawSessionToken}`, `csrf_token=${owner.csrfToken}`])
        .set('X-CSRF-Token', owner.csrfToken)
        .send({
          immediate: false,
        });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.cancelAtPeriodEnd).toBe(true);
      expect(cancelRes.body.data.status).toBe('active'); // Stays active until period end

      const subInDb = await Subscription.findOne({ businessId: owner.business._id });
      expect(subInDb?.cancelAtPeriodEnd).toBe(true);
      expect(subInDb?.status).toBe('active');
    });
  });

  describe('GET /api/v1/billing/payment-history & Multi-tenant Isolation', () => {
    it('returns paginated payment history and prevents cross-tenant data leakage', async () => {
      const ownerA = await createOwner('owner-a@test.com', 'Business A');
      const ownerB = await createOwner('owner-b@test.com', 'Business B');

      // Business A checks out monthly (9900 paise = ₹99)
      await request(app)
        .post('/api/v1/billing/subscription/checkout')
        .set('Cookie', [`session=${ownerA.rawSessionToken}`, `csrf_token=${ownerA.csrfToken}`])
        .set('X-CSRF-Token', ownerA.csrfToken)
        .send({ planId: 'monthly', interval: 'monthly' });

      // Business B checks out five_month (39900 paise = ₹399)
      await request(app)
        .post('/api/v1/billing/subscription/checkout')
        .set('Cookie', [`session=${ownerB.rawSessionToken}`, `csrf_token=${ownerB.csrfToken}`])
        .set('X-CSRF-Token', ownerB.csrfToken)
        .send({ planId: 'five_month', interval: 'five_month' });

      // Fetch payment history as Owner A
      const resA = await request(app)
        .get('/api/v1/billing/payment-history?page=1&limit=10')
        .set('Cookie', [`session=${ownerA.rawSessionToken}`]);

      expect(resA.status).toBe(200);
      expect(resA.body.success).toBe(true);
      expect(resA.body.data.items.length).toBe(1);
      expect(resA.body.data.items[0].amount).toBe(9900); // Monthly price
      expect(resA.body.data.items[0].isSimulated).toBe(true);
      expect(resA.body.data.pagination.total).toBe(1);

      // Verify no sensitive internal DB or payment details leaked
      expect(resA.body.data.items[0]).not.toHaveProperty('card');
      expect(resA.body.data.items[0]).not.toHaveProperty('cvv');
      expect(resA.body.data.items[0]).not.toHaveProperty('secret');

      // Fetch payment history as Owner B
      const resB = await request(app)
        .get('/api/v1/billing/payment-history?page=1&limit=10')
        .set('Cookie', [`session=${ownerB.rawSessionToken}`]);

      expect(resB.status).toBe(200);
      expect(resB.body.data.items.length).toBe(1);
      expect(resB.body.data.items[0].amount).toBe(39900); // Five-month price (isolated from Business A)
    });
  });
});
