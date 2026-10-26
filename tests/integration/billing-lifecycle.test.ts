import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import {
  setupTestDatabase,
  clearTestDatabase,
  teardownTestDatabase,
} from '../helpers/db-helper.js';
import { authService } from '../../src/modules/auth/auth.service.js';
import { mockEmailProvider } from '../../src/integrations/email/mock-email.provider.js';
import { Subscription } from '../../src/modules/billing/models/subscription.model.js';
import { Business } from '../../src/modules/businesses/business.model.js';

describe('Billing, Subscription & Razorpay Lifecycle Integration Tests', () => {
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

  async function createBusinessOwner(email: string, businessName: string) {
    await authService.requestSignupOtp({
      email,
      name: 'Owner',
      businessName,
      category: 'Hospitality',
      consentAccepted: true,
    });

    const otp = mockEmailProvider.getLatestOtpFor(email)!;
    const authResult = await authService.verifySignupOtp(
      { email, otp },
      { userAgent: 'test-browser', ipAddress: '127.0.0.1' },
    );

    return authResult;
  }

  describe('7-Day Free Trial Provisioning & Persistence', () => {
    it('creates a 7-day trial for genuinely new accounts without restarting on login or repeated requests', async () => {
      const owner = await createBusinessOwner('newtrial@test.com', 'Fresh Trial Bakery');

      // 1. Check initial subscription state
      const subRes = await request(app)
        .get('/api/v1/billing/subscription')
        .set('Cookie', [`session=${owner.rawSessionToken}`]);

      expect(subRes.status).toBe(200);
      expect(subRes.body.data.planId).toBe('trial');
      expect(subRes.body.data.entitlementStatus).toBe('trial_active');
      expect(subRes.body.data.canAccessProduct).toBe(true);

      const trialEndsAtOriginal = new Date(subRes.body.data.trialEndsAt).getTime();
      const now = Date.now();
      const diffDays = Math.round((trialEndsAtOriginal - now) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(7);

      // 2. Perform repeated request to get subscription - must NOT restart trial
      const subRes2 = await request(app)
        .get('/api/v1/billing/subscription')
        .set('Cookie', [`session=${owner.rawSessionToken}`]);

      expect(new Date(subRes2.body.data.trialEndsAt).getTime()).toBe(trialEndsAtOriginal);

      // 3. User logs in again via OTP - must NOT restart trial
      await authService.requestLoginOtp({ email: 'newtrial@test.com' });
      const loginOtp = mockEmailProvider.getLatestOtpFor('newtrial@test.com')!;
      const loginResult = await authService.verifyLoginOtp(
        { email: 'newtrial@test.com', otp: loginOtp },
        { userAgent: 'test-browser', ipAddress: '127.0.0.1' },
      );

      const subResAfterLogin = await request(app)
        .get('/api/v1/billing/subscription')
        .set('Cookie', [`session=${loginResult.rawSessionToken}`]);

      expect(new Date(subResAfterLogin.body.data.trialEndsAt).getTime()).toBe(trialEndsAtOriginal);
    });

    it('fairly backfills pre-existing accounts based on creation date', async () => {
      const owner = await createBusinessOwner('oldacc@test.com', 'Old Account Business');

      // Simulate an account created 10 days ago with no subscription record
      await Subscription.deleteMany({ businessId: owner.business._id });
      await Business.collection.updateOne(
        { _id: owner.business._id },
        { $set: { createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) } },
      );

      const subRes = await request(app)
        .get('/api/v1/billing/subscription')
        .set('Cookie', [`session=${owner.rawSessionToken}`]);

      expect(subRes.status).toBe(200);
      // Account created 10 days ago has exceeded 7-day trial
      expect(subRes.body.data.entitlementStatus).toBe('trial_expired');
      expect(subRes.body.data.canAccessProduct).toBe(false);
    });
  });

  describe('Promotional Code (FREE4YOU) Redemption', () => {
    it('successfully redeems FREE4YOU granting lifetime access and blocking duplicate attempts', async () => {
      const owner = await createBusinessOwner('promouser@test.com', 'Promo Electronics');

      // 1. Redeem FREE4YOU (whitespace and lower case normalized)
      const redeemRes = await request(app)
        .post('/api/v1/billing/redeem-promo')
        .set('Cookie', [`session=${owner.rawSessionToken}`, `csrf_token=${owner.csrfToken}`])
        .set('X-CSRF-Token', owner.csrfToken)
        .send({ code: '  free4you ' });

      expect(redeemRes.status).toBe(200);
      expect(redeemRes.body.data.code).toBe('FREE4YOU');
      expect(redeemRes.body.data.isLifetime).toBe(true);
      expect(redeemRes.body.data.subscription.entitlementSource).toBe('promo_free4you');

      // 2. Verify entitlement endpoint returns promo_active and lifetime
      const subRes = await request(app)
        .get('/api/v1/billing/subscription')
        .set('Cookie', [`session=${owner.rawSessionToken}`]);

      expect(subRes.body.data.entitlementStatus).toBe('promo_active');
      expect(subRes.body.data.isLifetime).toBe(true);
      expect(subRes.body.data.canAccessProduct).toBe(true);

      // 3. Attempt repeated redemption -> 409 Conflict
      const repeatRes = await request(app)
        .post('/api/v1/billing/redeem-promo')
        .set('Cookie', [`session=${owner.rawSessionToken}`, `csrf_token=${owner.csrfToken}`])
        .set('X-CSRF-Token', owner.csrfToken)
        .send({ code: 'FREE4YOU' });

      expect(repeatRes.status).toBe(409);
      expect(repeatRes.body.error.code).toBe('CONFLICT');
    });

    it('rejects invalid promo codes with 400 Bad Request', async () => {
      const owner = await createBusinessOwner('badcode@test.com', 'Bad Code Shop');

      const res = await request(app)
        .post('/api/v1/billing/redeem-promo')
        .set('Cookie', [`session=${owner.rawSessionToken}`, `csrf_token=${owner.csrfToken}`])
        .set('X-CSRF-Token', owner.csrfToken)
        .send({ code: 'INVALID_PROMO' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });
  });

  describe('Payment Verification & Plan Entitlements', () => {
    it('verifies checkout payment and grants 1 calendar month for Monthly plan (₹99)', async () => {
      const owner = await createBusinessOwner('monthlypay@test.com', 'Monthly Salon');

      // Checkout Monthly Plan
      const checkoutRes = await request(app)
        .post('/api/v1/billing/subscription/checkout')
        .set('Cookie', [`session=${owner.rawSessionToken}`, `csrf_token=${owner.csrfToken}`])
        .set('X-CSRF-Token', owner.csrfToken)
        .send({ planId: 'monthly', interval: 'monthly' });

      expect(checkoutRes.status).toBe(200);
      expect(checkoutRes.body.data.amount).toBe(9900); // ₹99 = 9900 paise

      const orderId = checkoutRes.body.data.checkoutId;

      // Verify payment with mock signature format
      const verifyRes = await request(app)
        .post('/api/v1/billing/verify-payment')
        .set('Cookie', [`session=${owner.rawSessionToken}`, `csrf_token=${owner.csrfToken}`])
        .set('X-CSRF-Token', owner.csrfToken)
        .send({
          orderId,
          paymentId: 'mock_pay_verified_123',
          signature: 'mock_sig_valid',
        });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.subscription.status).toBe('active');
      expect(verifyRes.body.data.subscription.entitlementSource).toBe('paid_subscription');
      expect(verifyRes.body.data.subscription.priceSnapshot.amount).toBe(9900);

      // Verify entitlement status
      const subRes = await request(app)
        .get('/api/v1/billing/subscription')
        .set('Cookie', [`session=${owner.rawSessionToken}`]);

      expect(subRes.body.data.entitlementStatus).toBe('paid_active');
      expect(subRes.body.data.canAccessProduct).toBe(true);
    });

    it('verifies checkout payment and grants 5 calendar months for Five-Month Package (₹399)', async () => {
      const owner = await createBusinessOwner('fivepay@test.com', 'Five Month Spa');

      const checkoutRes = await request(app)
        .post('/api/v1/billing/subscription/checkout')
        .set('Cookie', [`session=${owner.rawSessionToken}`, `csrf_token=${owner.csrfToken}`])
        .set('X-CSRF-Token', owner.csrfToken)
        .send({ planId: 'five_month', interval: 'five_month' });

      expect(checkoutRes.status).toBe(200);
      expect(checkoutRes.body.data.amount).toBe(39900); // ₹399 = 39900 paise

      const orderId = checkoutRes.body.data.checkoutId;

      const verifyRes = await request(app)
        .post('/api/v1/billing/verify-payment')
        .set('Cookie', [`session=${owner.rawSessionToken}`, `csrf_token=${owner.csrfToken}`])
        .set('X-CSRF-Token', owner.csrfToken)
        .send({
          orderId,
          paymentId: 'mock_pay_five_456',
          signature: 'mock_sig_valid',
        });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.subscription.status).toBe('active');
      expect(verifyRes.body.data.subscription.entitlementSource).toBe('paid_package');
      expect(verifyRes.body.data.subscription.priceSnapshot.amount).toBe(39900);
    });

    it('rejects invalid or forged payment signature', async () => {
      const owner = await createBusinessOwner('forgery@test.com', 'Forgery Business');

      const checkoutRes = await request(app)
        .post('/api/v1/billing/subscription/checkout')
        .set('Cookie', [`session=${owner.rawSessionToken}`, `csrf_token=${owner.csrfToken}`])
        .set('X-CSRF-Token', owner.csrfToken)
        .send({ planId: 'monthly', interval: 'monthly' });

      const res = await request(app)
        .post('/api/v1/billing/verify-payment')
        .set('Cookie', [`session=${owner.rawSessionToken}`, `csrf_token=${owner.csrfToken}`])
        .set('X-CSRF-Token', owner.csrfToken)
        .send({
          orderId: checkoutRes.body.data.checkoutId,
          paymentId: 'pay_tampered_789',
          signature: 'invalid_forged_sig',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
      expect(res.body.error.message).toMatch(/invalid.*signature/i);
    });
  });

  describe('Webhook Idempotency & Deduplication', () => {
    it('processes webhook payment and gracefully deduplicates duplicate deliveries', async () => {
      const owner = await createBusinessOwner('webhookowner@test.com', 'Webhook Cafe');

      // Create checkout intent
      const checkoutRes = await request(app)
        .post('/api/v1/billing/subscription/checkout')
        .set('Cookie', [`session=${owner.rawSessionToken}`, `csrf_token=${owner.csrfToken}`])
        .set('X-CSRF-Token', owner.csrfToken)
        .send({ planId: 'monthly', interval: 'monthly' });

      const checkoutId = checkoutRes.body.data.checkoutId;

      const webhookPayload = {
        id: 'event_wh_test_123',
        entity: 'event',
        account_id: 'acc_test_123',
        event: 'payment.captured',
        contains: ['payment'],
        payload: {
          payment: {
            entity: {
              id: 'pay_wh_captured_001',
              order_id: checkoutId,
              amount: 9900,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      };

      const webhookJson = JSON.stringify(webhookPayload);
      // In test mode, MockPaymentProvider checks signature starts with 'mock_sig_'
      const webhookSig = 'mock_sig_wh_valid';

      // 1. First webhook delivery
      const firstDelivery = await request(app)
        .post('/api/v1/billing/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', webhookSig)
        .send(webhookJson);

      expect(firstDelivery.status).toBe(200);
      expect(firstDelivery.body.data.status).toBe('processed');

      // 2. Second webhook delivery of exact same event -> Deduplicated idempotently
      const secondDelivery = await request(app)
        .post('/api/v1/billing/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', webhookSig)
        .send(webhookJson);

      expect(secondDelivery.status).toBe(200);
      expect(secondDelivery.body.data.status).toBe('ignored');
      expect(secondDelivery.body.data.duplicate).toBe(true);
    });
  });

  describe('Protected Route Enforcement', () => {
    it('blocks paid product operations (campaign creation, AI assistance) when trial is expired, but allows dashboard and public scans', async () => {
      const owner = await createBusinessOwner('expireduser@test.com', 'Expired Tech');

      // Manually set trial to expired in database
      await Subscription.findOneAndUpdate(
        { businessId: owner.business._id },
        {
          $set: {
            status: 'trial_expired',
            entitlementSource: 'none',
            trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Expired yesterday
            currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      );

      // 1. Attempt creating a QR campaign -> 403 Forbidden with TRIAL_EXPIRED
      const campaignRes = await request(app)
        .post('/api/v1/qr-campaigns')
        .set('Cookie', [`session=${owner.rawSessionToken}`, `csrf_token=${owner.csrfToken}`])
        .set('X-CSRF-Token', owner.csrfToken)
        .send({
          title: 'Expired Campaign',
          heading: 'Should Fail',
        });

      expect(campaignRes.status).toBe(403);
      expect(campaignRes.body.error.code).toBe('TRIAL_EXPIRED');

      // 2. Attempt AI assistance -> 403 Forbidden
      const aiRes = await request(app)
        .post('/api/v1/feedback/ai-assistance')
        .set('Cookie', [`session=${owner.rawSessionToken}`, `csrf_token=${owner.csrfToken}`])
        .set('X-CSRF-Token', owner.csrfToken)
        .send({
          customerName: 'Alice',
          rating: 4,
          comment: 'Great service!',
        });

      expect(aiRes.status).toBe(403);

      // 3. Essential non-paid read routes remain accessible:
      // A) Billing subscription info
      const subRes = await request(app)
        .get('/api/v1/billing/subscription')
        .set('Cookie', [`session=${owner.rawSessionToken}`]);
      expect(subRes.status).toBe(200);

      // B) Dashboard summary
      const dashRes = await request(app)
        .get('/api/v1/dashboard/summary')
        .set('Cookie', [`session=${owner.rawSessionToken}`]);
      expect(dashRes.status).toBe(200);

      // C) Redeeming FREE4YOU immediately unblocks paid operations
      const redeemRes = await request(app)
        .post('/api/v1/billing/redeem-promo')
        .set('Cookie', [`session=${owner.rawSessionToken}`, `csrf_token=${owner.csrfToken}`])
        .set('X-CSRF-Token', owner.csrfToken)
        .send({ code: 'FREE4YOU' });

      expect(redeemRes.status).toBe(200);

      // Now creating campaign succeeds!
      const unblockedCampaignRes = await request(app)
        .post('/api/v1/qr-campaigns')
        .set('Cookie', [`session=${owner.rawSessionToken}`, `csrf_token=${owner.csrfToken}`])
        .set('X-CSRF-Token', owner.csrfToken)
        .send({
          title: 'Unblocked Campaign',
          heading: 'Now Active',
        });

      expect(unblockedCampaignRes.status).toBe(201);
    });
  });
});
