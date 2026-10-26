import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import {
  setupTestDatabase,
  clearTestDatabase,
  teardownTestDatabase,
} from '../../helpers/db-helper.js';
import { billingService } from '../../../src/modules/billing/billing.service.js';
import { Subscription } from '../../../src/modules/billing/models/subscription.model.js';
import { PromoRedemption } from '../../../src/modules/billing/models/promo-redemption.model.js';
import { Business } from '../../../src/modules/businesses/business.model.js';
import { User } from '../../../src/modules/users/user.model.js';
import { ConflictError, BadRequestError } from '../../../src/common/errors/app-error.js';

describe('Promotional Code (FREE4YOU) Unit Tests', () => {
  let businessId: Types.ObjectId;
  let ownerId: Types.ObjectId;

  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();

    const user = await User.create({
      email: 'promo-owner@test.com',
      name: 'Promo Owner',
      role: 'business_owner',
      status: 'active',
      consentAccepted: true,
      consentAcceptedAt: new Date(),
    });
    ownerId = user._id;

    const business = await Business.create({
      name: 'Promo Cafe',
      category: 'Dining',
      ownerId,
      status: 'active',
    });
    businessId = business._id;

    // Initialize initial trial subscription
    await billingService.initializeTrial(businessId, ownerId);
  });

  it('safely normalizes code (trims and converts to uppercase) and grants lifetime access', async () => {
    // Input with mixed case and leading/trailing whitespace
    const rawInput = '  free4you   ';
    const result = await billingService.redeemPromoCode(businessId, ownerId, rawInput);

    expect(result.success).toBe(true);
    expect(result.code).toBe('FREE4YOU');
    expect(result.isLifetime).toBe(true);
    expect(result.subscription.planId).toBe('free4you');
    expect(result.subscription.status).toBe('active');
    expect(result.subscription.entitlementSource).toBe('promo_free4you');

    // Verify database records
    const sub = await Subscription.findOne({ businessId });
    expect(sub).toBeDefined();
    expect(sub?.status).toBe('active');
    expect(sub?.entitlementSource).toBe('promo_free4you');
    expect(sub?.planId).toBe('free4you');

    const redemption = await PromoRedemption.findOne({ businessId, code: 'FREE4YOU' });
    expect(redemption).toBeDefined();
    expect(redemption?.ownerId.toString()).toBe(ownerId.toString());

    // Verify entitlement computation
    const entitlement = await billingService.getEntitlement(businessId);
    expect(entitlement.status).toBe('promo_active');
    expect(entitlement.canAccessProduct).toBe(true);
    expect(entitlement.isLifetime).toBe(true);
    expect(entitlement.planName).toMatch(/lifetime/i);
  });

  it('rejects invalid promotional codes', async () => {
    await expect(
      billingService.redeemPromoCode(businessId, ownerId, 'INVALID_CODE'),
    ).rejects.toThrow(BadRequestError);

    await expect(
      billingService.redeemPromoCode(businessId, ownerId, 'DISCOUNT99'),
    ).rejects.toThrow(BadRequestError);
  });

  it('prevents repeated redemption by the same business', async () => {
    // First redemption succeeds
    await billingService.redeemPromoCode(businessId, ownerId, 'FREE4YOU');

    // Second redemption must be rejected with ConflictError
    await expect(
      billingService.redeemPromoCode(businessId, ownerId, 'FREE4YOU'),
    ).rejects.toThrow(ConflictError);
  });

  it('enforces database-level unique index on { code, businessId } to block concurrent redemptions', async () => {
    await PromoRedemption.init();
    await PromoRedemption.create({
      code: 'FREE4YOU',
      businessId,
      ownerId,
      entitlementGranted: 'promo_free4you',
      redeemedAt: new Date(),
    });

    // Attempting a second insert for same business & code violates unique compound index
    await expect(
      PromoRedemption.create({
        code: 'FREE4YOU',
        businessId,
        ownerId,
        entitlementGranted: 'promo_free4you',
        redeemedAt: new Date(),
      }),
    ).rejects.toThrow();
  });
});
