import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase,
  clearTestDatabase,
  teardownTestDatabase,
} from '../../helpers/db-helper.js';
import {
  Plan,
  seedDefaultPlans,
  DEFAULT_PLANS,
} from '../../../src/modules/billing/models/plan.model.js';
import {
  MockPaymentProvider,
  getPaymentProvider,
} from '../../../src/integrations/payments/index.js';
import {
  checkoutSchema,
  cancelSubscriptionSchema,
  paymentHistoryQuerySchema,
} from '../../../src/modules/billing/billing.validation.js';
import { env } from '../../../src/config/env.js';

describe('Billing Unit Tests (Phase 9)', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
  });

  describe('Plan Model & Seeding', () => {
    it('seeds default development plans with integer minor units', async () => {
      await seedDefaultPlans();
      const count = await Plan.countDocuments();
      expect(count).toBe(DEFAULT_PLANS.length);

      const monthly = await Plan.findOne({ planId: 'monthly' });
      expect(monthly).toBeDefined();
      expect(monthly?.name).toBe('Monthly Plan');
      expect(monthly?.price).toBe(9900); // 99.00 INR in minor units (paise)
      expect(monthly?.currency).toBe('INR');
      expect(monthly?.isPublished).toBe(true);

      const fiveMonth = await Plan.findOne({ planId: 'five_month' });
      expect(fiveMonth).toBeDefined();
      expect(fiveMonth?.name).toBe('Five-Month Package');
      expect(fiveMonth?.price).toBe(39900); // 399.00 INR in minor units (paise)
      expect(fiveMonth?.currency).toBe('INR');
      expect(fiveMonth?.isPublished).toBe(true);
    });

    it('enforces unique planId on plans', async () => {
      await Plan.create({
        planId: 'custom-pro',
        name: 'Custom Pro',
        description: 'Test plan',
        price: 50000,
        currency: 'INR',
        interval: 'monthly',
        isPublished: true,
        features: ['Feature 1'],
        limits: { maxCampaigns: 2, maxMonthlyScans: 200, aiAssistanceEnabled: true },
      });

      await expect(
        Plan.create({
          planId: 'custom-pro',
          name: 'Duplicate Plan',
          description: 'Duplicate',
          price: 50000,
          currency: 'INR',
          interval: 'monthly',
          isPublished: true,
          features: ['Feature 1'],
          limits: { maxCampaigns: 2, maxMonthlyScans: 200, aiAssistanceEnabled: true },
        }),
      ).rejects.toThrow();
    });
  });

  describe('MockPaymentProvider & Safeguards', () => {
    it('generates simulated checkout intent with isSimulated flag', async () => {
      const provider = new MockPaymentProvider();
      const result = await provider.createCheckoutIntent({
        businessId: 'bus_123',
        ownerId: 'usr_123',
        planId: 'starter',
        planName: 'Starter',
        amount: 99900,
        currency: 'INR',
        interval: 'monthly',
        simulateSuccess: true,
      });

      expect(result.provider).toBe('mock');
      expect(result.isSimulated).toBe(true);
      expect(result.status).toBe('succeeded');
      expect(result.checkoutId).toMatch(/^mock_chk_/);
      expect(result.paymentReference).toMatch(/^mock_pay_/);
    });

    it('returns failed status when simulateSuccess is false', async () => {
      const provider = new MockPaymentProvider();
      const result = await provider.createCheckoutIntent({
        businessId: 'bus_123',
        ownerId: 'usr_123',
        planId: 'starter',
        planName: 'Starter',
        amount: 99900,
        currency: 'INR',
        interval: 'monthly',
        simulateSuccess: false,
      });

      expect(result.status).toBe('failed');
      expect(result.paymentReference).toBeUndefined();
      expect(result.isSimulated).toBe(true);
    });

    it('getPaymentProvider returns mock provider in development/test', () => {
      const provider = getPaymentProvider();
      expect(provider).toBeDefined();
      expect(provider.createCheckoutIntent).toBeDefined();
    });

    it('rejects mock provider when NODE_ENV is production', () => {
      const originalEnv = env.NODE_ENV;
      try {
        (env as Record<string, unknown>).NODE_ENV = 'production';
        expect(() => getPaymentProvider()).toThrow(/prohibited in production/);
      } finally {
        (env as Record<string, unknown>).NODE_ENV = originalEnv;
      }
    });
  });

  describe('Billing Validation Schemas', () => {
    it('validates checkout schema with strict mode', () => {
      const valid = checkoutSchema.safeParse({
        planId: 'starter',
        interval: 'monthly',
        simulateSuccess: true,
      });
      expect(valid.success).toBe(true);
    });

    it('rejects unknown fields in checkout schema (preventing client price injection)', () => {
      const invalid = checkoutSchema.safeParse({
        planId: 'starter',
        price: 0, // Client attempting to tamper with price
        status: 'active', // Client attempting to force active status
      });
      expect(invalid.success).toBe(false);
    });

    it('rejects empty planId', () => {
      const invalid = checkoutSchema.safeParse({
        planId: '',
      });
      expect(invalid.success).toBe(false);
    });

    it('validates cancel subscription schema with strict mode', () => {
      const valid = cancelSubscriptionSchema.safeParse({ immediate: true });
      expect(valid.success).toBe(true);

      const invalid = cancelSubscriptionSchema.safeParse({ immediate: true, refundAmount: 100 });
      expect(invalid.success).toBe(false);
    });

    it('validates and bounds payment history query schema', () => {
      const parsed = paymentHistoryQuerySchema.parse({ page: '2', limit: '15' });
      expect(parsed.page).toBe(2);
      expect(parsed.limit).toBe(15);

      const bounded = paymentHistoryQuerySchema.safeParse({ page: '1', limit: '50' }); // limit > 20
      expect(bounded.success).toBe(false);
    });
  });
});
