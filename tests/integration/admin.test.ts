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
import { User } from '../../src/modules/users/user.model.js';
import { seedDefaultPlans } from '../../src/modules/billing/models/plan.model.js';
import { Subscription } from '../../src/modules/billing/models/subscription.model.js';
import { PaymentEvent } from '../../src/modules/billing/models/payment-event.model.js';

describe('Super Admin Portal & Platform Management Integration Tests (Phase 10)', () => {
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

  async function createBusinessOwner(email: string, businessName: string) {
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

  async function createSuperAdmin(email: string) {
    // 1. Create a super_admin user directly (trusted server-side provisioning)
    const adminUser = await User.create({
      email: email.trim().toLowerCase(),
      name: 'Platform Admin',
      role: 'super_admin',
      status: 'active',
      isEmailVerified: true,
    });

    // 2. Log in using the standard email OTP flow
    await authService.requestLoginOtp({ email });
    const otp = mockEmailProvider.getLatestOtpFor(email)!;
    const { user, rawSessionToken, csrfToken } = await authService.verifyLoginOtp(
      { email, otp },
      { userAgent: 'admin-agent' },
    );

    return { user, rawSessionToken, csrfToken, adminUser };
  }

  describe('Super Admin Access & Authorization Security', () => {
    it('rejects unauthenticated requests to admin endpoints with 401', async () => {
      const endpoints = [
        { method: 'get', url: '/api/v1/admin/overview' },
        { method: 'get', url: '/api/v1/admin/businesses' },
        { method: 'get', url: '/api/v1/admin/subscriptions' },
        { method: 'get', url: '/api/v1/admin/plans' },
        { method: 'post', url: '/api/v1/admin/plans' },
        { method: 'get', url: '/api/v1/admin/audit-logs' },
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

    it('denies access to business owners with 403 Forbidden', async () => {
      const owner = await createBusinessOwner('owner-forbidden@test.com', 'Owner Cafe');

      const endpoints = [
        '/api/v1/admin/overview',
        '/api/v1/admin/businesses',
        '/api/v1/admin/subscriptions',
        '/api/v1/admin/plans',
        '/api/v1/admin/audit-logs',
      ];

      for (const url of endpoints) {
        const res = await request(app)
          .get(url)
          .set('Cookie', [`session=${owner.rawSessionToken}`]);

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('FORBIDDEN');
      }
    });

    it('grants access to authenticated Super Admin', async () => {
      const admin = await createSuperAdmin('admin-granted@platform.com');

      const res = await request(app)
        .get('/api/v1/admin/overview')
        .set('Cookie', [`session=${admin.rawSessionToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('businesses');
      expect(res.body.data).toHaveProperty('revenue');
    });

    it('guarantees public signup cannot create a super_admin', async () => {
      await authService.requestSignupOtp({
        email: 'attacker@evil.com',
        name: 'Attacker',
        businessName: 'Fake Corp',
        category: 'Tech',
        consentAccepted: true,
      });

      const otp = mockEmailProvider.getLatestOtpFor('attacker@evil.com')!;
      const { user } = await authService.verifySignupOtp(
        { email: 'attacker@evil.com', otp },
        { userAgent: 'test-agent' },
      );

      expect(user.role).toBe('business_owner');
      expect(user.role).not.toBe('super_admin');
    });
  });

  describe('GET /api/v1/admin/overview & Revenue Metrics', () => {
    it('calculates platform metrics accurately from real database records', async () => {
      const admin = await createSuperAdmin('admin-metrics@platform.com');
      const owner1 = await createBusinessOwner('owner1@test.com', 'Bistro 1');
      const owner2 = await createBusinessOwner('owner2@test.com', 'Bistro 2');

      // Create a successful payment event for Owner 1 (999.00 INR)
      await PaymentEvent.create({
        businessId: owner1.business._id,
        ownerId: owner1.user._id,
        provider: 'mock',
        isSimulated: true,
        eventType: 'payment.succeeded',
        status: 'success',
        amount: 99900,
        currency: 'INR',
        idempotencyKey: 'pay_succ_1',
      });

      // Create another successful payment event for Owner 2 (2999.00 INR)
      await PaymentEvent.create({
        businessId: owner2.business._id,
        ownerId: owner2.user._id,
        provider: 'mock',
        isSimulated: true,
        eventType: 'payment.succeeded',
        status: 'success',
        amount: 299900,
        currency: 'INR',
        idempotencyKey: 'pay_succ_2',
      });

      // Create a FAILED payment event (should NOT be counted as revenue!)
      await PaymentEvent.create({
        businessId: owner1.business._id,
        ownerId: owner1.user._id,
        provider: 'mock',
        isSimulated: true,
        eventType: 'payment.failed',
        status: 'failed',
        amount: 99900,
        currency: 'INR',
        idempotencyKey: 'pay_fail_1',
      });

      // Create a PENDING payment event (should NOT be counted as revenue!)
      await PaymentEvent.create({
        businessId: owner2.business._id,
        ownerId: owner2.user._id,
        provider: 'mock',
        isSimulated: true,
        eventType: 'checkout.initiated',
        status: 'pending',
        amount: 299900,
        currency: 'INR',
        idempotencyKey: 'pay_pend_1',
      });

      const res = await request(app)
        .get('/api/v1/admin/overview')
        .set('Cookie', [`session=${admin.rawSessionToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(data.businesses.total).toBe(2);
      expect(data.businesses.active).toBe(2);
      expect(data.users.businessOwners).toBe(2);
      expect(data.users.superAdmins).toBe(1);

      // Revenue: strictly 99900 + 299900 = 399800 (failed and pending excluded!)
      expect(data.revenue.totalAmountMinor).toBe(399800);
      expect(data.revenue.successfulTransactionsCount).toBe(2);
      expect(data.revenue.isSimulated).toBe(true);
    });
  });

  describe('GET /api/v1/admin/businesses & GET /api/v1/admin/businesses/:id', () => {
    it('returns paginated and searchable businesses list without sensitive fields', async () => {
      const admin = await createSuperAdmin('admin-biz@platform.com');
      await createBusinessOwner('alpha@cafe.com', 'Alpha Cafe');
      await createBusinessOwner('beta@bakery.com', 'Beta Bakery');

      // 1. List all businesses
      const listRes = await request(app)
        .get('/api/v1/admin/businesses?page=1&limit=10')
        .set('Cookie', [`session=${admin.rawSessionToken}`]);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.items.length).toBe(2);
      expect(listRes.body.data.pagination.total).toBe(2);

      const alpha = listRes.body.data.items.find((b: { name: string }) => b.name === 'Alpha Cafe');
      expect(alpha).toBeDefined();
      expect(alpha.owner.email).toBe('alpha@cafe.com');

      // Verify no sensitive tokens/secrets leaked
      expect(alpha).not.toHaveProperty('otpHash');
      expect(alpha).not.toHaveProperty('tokenHash');

      // 2. Search query filter
      const searchRes = await request(app)
        .get('/api/v1/admin/businesses?query=Alpha')
        .set('Cookie', [`session=${admin.rawSessionToken}`]);

      expect(searchRes.status).toBe(200);
      expect(searchRes.body.data.items.length).toBe(1);
      expect(searchRes.body.data.items[0].name).toBe('Alpha Cafe');

      // 3. Detail endpoint
      const detailRes = await request(app)
        .get(`/api/v1/admin/businesses/${alpha.id}`)
        .set('Cookie', [`session=${admin.rawSessionToken}`]);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.id).toBe(alpha.id);
      expect(detailRes.body.data.name).toBe('Alpha Cafe');
      expect(detailRes.body.data.stats).toHaveProperty('campaignsCount');
      expect(detailRes.body.data.stats).toHaveProperty('feedbacksCount');
    });

    it('returns 404 for invalid business ID', async () => {
      const admin = await createSuperAdmin('admin-notfound@platform.com');

      const res = await request(app)
        .get('/api/v1/admin/businesses/6719de1234567890abcdef99')
        .set('Cookie', [`session=${admin.rawSessionToken}`]);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/admin/subscriptions', () => {
    it('lists subscriptions across businesses with status filter', async () => {
      const admin = await createSuperAdmin('admin-subs@platform.com');
      const owner = await createBusinessOwner('sub-owner@test.com', 'Subscribed Business');

      // Create an active subscription (clearing default trial subscription from signup)
      await Subscription.deleteMany({ businessId: owner.business._id });
      await Subscription.create({
        businessId: owner.business._id,
        ownerId: owner.user._id,
        planId: 'starter',
        status: 'active',
        billingInterval: 'monthly',
        priceSnapshot: { amount: 99900, currency: 'INR' },
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      const res = await request(app)
        .get('/api/v1/admin/subscriptions?status=active')
        .set('Cookie', [`session=${admin.rawSessionToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].planId).toBe('starter');
      expect(res.body.data.items[0].businessName).toBe('Subscribed Business');
    });
  });

  describe('Plan Management & Historical Pricing Integrity', () => {
    it('creates and updates plans with audit logging while preserving historical subscription price snapshots', async () => {
      const admin = await createSuperAdmin('admin-plan-mgr@platform.com');
      const owner = await createBusinessOwner('plan-owner@test.com', 'Historical Bistro');

      // 1. Subscribe owner to 'starter' plan at current price of 99900 (clearing default trial)
      await Subscription.deleteMany({ businessId: owner.business._id });
      const subscription = await Subscription.create({
        businessId: owner.business._id,
        ownerId: owner.user._id,
        planId: 'starter',
        status: 'active',
        billingInterval: 'monthly',
        priceSnapshot: { amount: 99900, currency: 'INR' },
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      // 2. Admin creates a new plan
      const createRes = await request(app)
        .post('/api/v1/admin/plans')
        .set('Cookie', [`session=${admin.rawSessionToken}`, `csrf_token=${admin.csrfToken}`])
        .set('X-CSRF-Token', admin.csrfToken)
        .send({
          planId: 'enterprise-custom',
          name: 'Enterprise Custom',
          description: 'High volume enterprise tier',
          price: 999900,
          currency: 'INR',
          interval: 'yearly',
          isPublished: true,
          features: ['Dedicated Account Manager', 'Custom integrations'],
          limits: { maxCampaigns: 100, maxMonthlyScans: 50000, aiAssistanceEnabled: true },
          sortOrder: 4,
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.success).toBe(true);
      expect(createRes.body.data.planId).toBe('enterprise-custom');

      // 3. Admin updates the 'starter' plan price to 149900 (price increase)
      const updateRes = await request(app)
        .patch('/api/v1/admin/plans/starter')
        .set('Cookie', [`session=${admin.rawSessionToken}`, `csrf_token=${admin.csrfToken}`])
        .set('X-CSRF-Token', admin.csrfToken)
        .send({
          price: 149900, // New price
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.success).toBe(true);
      expect(updateRes.body.data.price).toBe(149900);

      // 4. CRITICAL VERIFICATION: Existing subscription's historical price snapshot must be PRESERVED
      const reloadedSubscription = await Subscription.findById(subscription._id);
      expect(reloadedSubscription?.priceSnapshot.amount).toBe(99900); // Intact!

      // 5. Verify Audit Logs were created for both actions
      const auditRes = await request(app)
        .get('/api/v1/admin/audit-logs')
        .set('Cookie', [`session=${admin.rawSessionToken}`]);

      expect(auditRes.status).toBe(200);
      const actions = auditRes.body.data.items.map((l: { action: string }) => l.action);
      expect(actions).toContain('plan.created');
      expect(actions).toContain('plan.updated');
    });
  });

  describe('GET /api/v1/admin/me session verification', () => {
    it('returns super admin profile when authenticated', async () => {
      const admin = await createSuperAdmin('me-admin@platform.com');
      const res = await request(app)
        .get('/api/v1/admin/me')
        .set('Cookie', [`session=${admin.rawSessionToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('me-admin@platform.com');
      expect(res.body.data.role).toBe('super_admin');
    });
  });

  describe('Business Suspension & Reactivation', () => {
    it('suspends and reactivates a business with mandatory reason and audit logs', async () => {
      const admin = await createSuperAdmin('mod-admin@platform.com');
      const owner = await createBusinessOwner('suspend-me@test.com', 'Violating Cafe');

      // 1. Suspend business
      const suspendRes = await request(app)
        .patch(`/api/v1/admin/businesses/${owner.business._id}/status`)
        .set('Cookie', [`session=${admin.rawSessionToken}`, `csrf_token=${admin.csrfToken}`])
        .set('X-CSRF-Token', admin.csrfToken)
        .send({
          status: 'suspended',
          reason: 'Policy violation: suspicious feedback patterns',
        });

      expect(suspendRes.status).toBe(200);
      expect(suspendRes.body.success).toBe(true);
      expect(suspendRes.body.data.status).toBe('suspended');

      // 2. Reactivate business
      const reactivateRes = await request(app)
        .patch(`/api/v1/admin/businesses/${owner.business._id}/status`)
        .set('Cookie', [`session=${admin.rawSessionToken}`, `csrf_token=${admin.csrfToken}`])
        .set('X-CSRF-Token', admin.csrfToken)
        .send({
          status: 'active',
          reason: 'Investigation cleared: false positive resolved',
        });

      expect(reactivateRes.status).toBe(200);
      expect(reactivateRes.body.success).toBe(true);
      expect(reactivateRes.body.data.status).toBe('active');

      // 3. Verify audit trail
      const auditRes = await request(app)
        .get('/api/v1/admin/audit-logs')
        .set('Cookie', [`session=${admin.rawSessionToken}`]);

      const actions = auditRes.body.data.items.map((l: { action: string }) => l.action);
      expect(actions).toContain('business.suspended');
      expect(actions).toContain('business.reactivated');
    });
  });

  describe('Subscription Override / Manual Entitlement Correction', () => {
    it('overrides subscription period end and status with audit logging', async () => {
      const admin = await createSuperAdmin('sub-admin@platform.com');
      const owner = await createBusinessOwner('sub-override@test.com', 'Override Bakery');

      const sub = await Subscription.findOne({ businessId: owner.business._id });
      expect(sub).toBeDefined();

      const futureDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

      const overrideRes = await request(app)
        .patch(`/api/v1/admin/subscriptions/${sub!._id}/override`)
        .set('Cookie', [`session=${admin.rawSessionToken}`, `csrf_token=${admin.csrfToken}`])
        .set('X-CSRF-Token', admin.csrfToken)
        .send({
          currentPeriodEnd: futureDate,
          status: 'active',
          reason: 'Administrative courtesy extension granted per support ticket #4412',
        });

      expect(overrideRes.status).toBe(200);
      expect(overrideRes.body.success).toBe(true);

      const updatedSub = await Subscription.findById(sub!._id);
      expect(new Date(updatedSub!.currentPeriodEnd).toISOString()).toBe(futureDate);

      // Verify audit log
      const auditRes = await request(app)
        .get('/api/v1/admin/audit-logs')
        .set('Cookie', [`session=${admin.rawSessionToken}`]);

      const actions = auditRes.body.data.items.map((l: { action: string }) => l.action);
      expect(actions).toContain('subscription.overridden');
    });
  });

  describe('Promotion Lifecycle Management (FREE4YOU)', () => {
    it('pauses and retires FREE4YOU preventing new redemptions while preserving existing entitlements', async () => {
      const admin = await createSuperAdmin('promo-admin@platform.com');
      const owner1 = await createBusinessOwner('early-bird@test.com', 'Early Bird Bistro');
      const owner2 = await createBusinessOwner('late-bird@test.com', 'Late Bird Cafe');

      // 1. Initial state: owner1 redeems FREE4YOU successfully
      const redeem1 = await request(app)
        .post('/api/v1/billing/redeem-promo')
        .set('Cookie', [`session=${owner1.rawSessionToken}`, `csrf_token=${owner1.csrfToken}`])
        .set('X-CSRF-Token', owner1.csrfToken)
        .send({ code: 'FREE4YOU' });

      expect(redeem1.status).toBe(200);
      expect(redeem1.body.success).toBe(true);

      // 2. Admin pauses FREE4YOU
      const pauseRes = await request(app)
        .post('/api/v1/admin/promotions/FREE4YOU/pause')
        .set('Cookie', [`session=${admin.rawSessionToken}`, `csrf_token=${admin.csrfToken}`])
        .set('X-CSRF-Token', admin.csrfToken)
        .send();

      expect(pauseRes.status).toBe(200);
      expect(pauseRes.body.data.status).toBe('paused');

      // 3. Late bird attempts to redeem while paused -> BLOCKED
      const redeem2Blocked = await request(app)
        .post('/api/v1/billing/redeem-promo')
        .set('Cookie', [`session=${owner2.rawSessionToken}`, `csrf_token=${owner2.csrfToken}`])
        .set('X-CSRF-Token', owner2.csrfToken)
        .send({ code: 'FREE4YOU' });

      expect(redeem2Blocked.status).toBe(400);
      expect(redeem2Blocked.body.error.message).toMatch(/paused/i);

      // 4. CRITICAL: Early bird entitlement remains valid and untouched
      const sub1 = await Subscription.findOne({ businessId: owner1.business._id });
      expect(sub1?.planId).toBe('free4you');
      expect(sub1?.status).toBe('active');

      // 5. Admin resumes FREE4YOU
      const resumeRes = await request(app)
        .post('/api/v1/admin/promotions/FREE4YOU/resume')
        .set('Cookie', [`session=${admin.rawSessionToken}`, `csrf_token=${admin.csrfToken}`])
        .set('X-CSRF-Token', admin.csrfToken)
        .send();

      expect(resumeRes.status).toBe(200);
      expect(resumeRes.body.data.status).toBe('active');

      // 6. Admin retires FREE4YOU with 30-day migration deadline and reason
      const retireRes = await request(app)
        .post('/api/v1/admin/promotions/FREE4YOU/retire')
        .set('Cookie', [`session=${admin.rawSessionToken}`, `csrf_token=${admin.csrfToken}`])
        .set('X-CSRF-Token', admin.csrfToken)
        .send({
          gracePeriodDays: 30,
          reason: 'Promotion concluded; transitioning to paid tiers',
        });

      expect(retireRes.status).toBe(200);
      expect(retireRes.body.data.promotion.status).toBe('retired');
      expect(retireRes.body.data.affectedAccountsCount).toBeGreaterThanOrEqual(1);

      // 7. Late bird attempts to redeem retired promotion -> BLOCKED
      const redeem3Retired = await request(app)
        .post('/api/v1/billing/redeem-promo')
        .set('Cookie', [`session=${owner2.rawSessionToken}`, `csrf_token=${owner2.csrfToken}`])
        .set('X-CSRF-Token', owner2.csrfToken)
        .send({ code: 'FREE4YOU' });

      expect(redeem3Retired.status).toBe(400);
      expect(redeem3Retired.body.error.message).toMatch(/retired/i);
    });
  });

  describe('Payments & Operations Observability', () => {
    it('returns payment list, billing operations health, and webhooks without leaking secrets', async () => {
      const admin = await createSuperAdmin('ops-admin@platform.com');

      // 1. Query payments
      const paymentsRes = await request(app)
        .get('/api/v1/admin/payments')
        .set('Cookie', [`session=${admin.rawSessionToken}`]);

      expect(paymentsRes.status).toBe(200);
      expect(paymentsRes.body.success).toBe(true);
      expect(Array.isArray(paymentsRes.body.data.items)).toBe(true);

      // 2. Query billing operations health
      const healthRes = await request(app)
        .get('/api/v1/admin/operations/health')
        .set('Cookie', [`session=${admin.rawSessionToken}`]);

      expect(healthRes.status).toBe(200);
      expect(healthRes.body.success).toBe(true);
      expect(healthRes.body.data).toHaveProperty('provider');
      expect(healthRes.body.data).toHaveProperty('totalWebhooks');
      // Verify no secrets leaked
      expect(healthRes.body.data).not.toHaveProperty('keySecret');
      expect(healthRes.body.data).not.toHaveProperty('webhookSecret');

      // 3. Query webhooks
      const webhooksRes = await request(app)
        .get('/api/v1/admin/operations/webhooks')
        .set('Cookie', [`session=${admin.rawSessionToken}`]);

      expect(webhooksRes.status).toBe(200);
      expect(webhooksRes.body.success).toBe(true);
      expect(Array.isArray(webhooksRes.body.data.items)).toBe(true);
    });
  });
});

