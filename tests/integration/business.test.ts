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

describe('Business Management HTTP Integration Tests', () => {
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

  // Helper to register an owner and return cookies and business
  async function createAuthenticatedOwner(email: string, businessName: string) {
    await authService.requestSignupOtp({
      email,
      name: 'Owner Name',
      businessName,
      category: 'Food & Beverage',
      consentAccepted: true,
    });

    const otp = mockEmailProvider.getLatestOtpFor(email)!;
    const { user, business, rawSessionToken, csrfToken } = await authService.verifySignupOtp(
      { email, otp },
      { userAgent: 'test-agent' },
    );

    return { user, business, rawSessionToken, csrfToken };
  }

  it('GET /api/v1/business should return 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/v1/business');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('GET /api/v1/business should return authenticated business profile', async () => {
    const { business, rawSessionToken } = await createAuthenticatedOwner(
      'owner1@bistro.com',
      'The Rustic Bistro',
    );

    const res = await request(app)
      .get('/api/v1/business')
      .set('Cookie', [`session=${rawSessionToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data._id).toBe(business._id.toString());
    expect(res.body.data.name).toBe('The Rustic Bistro');
    expect(res.body.data.category).toBe('Food & Beverage');
    expect(res.body.data.branding.primaryColor).toBe('#2563EB');
  });

  it('PATCH /api/v1/business should update permitted profile fields with CSRF token', async () => {
    const { rawSessionToken, csrfToken } = await createAuthenticatedOwner(
      'update@cafe.com',
      'Original Cafe',
    );

    const updatePayload = {
      name: 'Updated Artisan Cafe',
      category: 'Artisan Coffee',
      googleReviewUrl: 'https://maps.google.com/?cid=1234567890',
      branding: {
        primaryColor: '#10B981',
      },
    };

    const res = await request(app)
      .patch('/api/v1/business')
      .set('Cookie', [`session=${rawSessionToken}`, `csrf_token=${csrfToken}`])
      .set('x-csrf-token', csrfToken)
      .send(updatePayload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Updated Artisan Cafe');
    expect(res.body.data.category).toBe('Artisan Coffee');
    expect(res.body.data.googleReviewUrl).toBe('https://maps.google.com/?cid=1234567890');
    expect(res.body.data.branding.primaryColor).toBe('#10B981');
    expect(res.body.data.branding.secondaryColor).toBe('#1E293B'); // Unchanged default
  });

  it('PATCH /api/v1/business should reject forbidden fields and mass-assignment attempts', async () => {
    const { rawSessionToken, csrfToken } = await createAuthenticatedOwner(
      'hacker@exploit.com',
      'Exploit Test',
    );

    // Attempt to change ownership, status, or inject MongoDB operators
    const maliciousPayload = {
      name: 'Legit Name',
      ownerId: '6719dd666666666666666666',
      status: 'active',
      subscription: 'enterprise_vip_free',
    };

    const res = await request(app)
      .patch('/api/v1/business')
      .set('Cookie', [`session=${rawSessionToken}`, `csrf_token=${csrfToken}`])
      .set('x-csrf-token', csrfToken)
      .send(maliciousPayload);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('PATCH /api/v1/business should reject invalid URLs and hex colors', async () => {
    const { rawSessionToken, csrfToken } = await createAuthenticatedOwner(
      'validation@cafe.com',
      'Validation Cafe',
    );

    // Invalid URL
    const resUrl = await request(app)
      .patch('/api/v1/business')
      .set('Cookie', [`session=${rawSessionToken}`, `csrf_token=${csrfToken}`])
      .set('x-csrf-token', csrfToken)
      .send({ googleReviewUrl: 'not-a-valid-url' });

    expect(resUrl.status).toBe(400);

    // Invalid hex color
    const resColor = await request(app)
      .patch('/api/v1/business')
      .set('Cookie', [`session=${rawSessionToken}`, `csrf_token=${csrfToken}`])
      .set('x-csrf-token', csrfToken)
      .send({ branding: { primaryColor: 'blue' } });

    expect(resColor.status).toBe(400);
  });

  it('GET and PATCH /api/v1/business/settings should retrieve and update business settings', async () => {
    const { rawSessionToken, csrfToken } = await createAuthenticatedOwner(
      'settings@bakery.com',
      'Settings Bakery',
    );

    // 1. Get default settings
    const getRes = await request(app)
      .get('/api/v1/business/settings')
      .set('Cookie', [`session=${rawSessionToken}`]);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.defaultLanguage).toBe('en');
    expect(getRes.body.data.allowPublicReviews).toBe(true);
    expect(getRes.body.data.notificationEmail).toBeNull();

    // 2. Update settings
    const patchRes = await request(app)
      .patch('/api/v1/business/settings')
      .set('Cookie', [`session=${rawSessionToken}`, `csrf_token=${csrfToken}`])
      .set('x-csrf-token', csrfToken)
      .send({
        allowPublicReviews: false,
        notificationEmail: 'alerts@bakery.com',
        headingText: 'Share your feedback with us!',
        subheadingText: 'Your review helps us bake better bread every day.',
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.allowPublicReviews).toBe(false);
    expect(patchRes.body.data.notificationEmail).toBe('alerts@bakery.com');
    expect(patchRes.body.data.headingText).toBe('Share your feedback with us!');
    expect(patchRes.body.data.subheadingText).toBe(
      'Your review helps us bake better bread every day.',
    );

    // 3. Reject forbidden settings properties
    const badSettingsRes = await request(app)
      .patch('/api/v1/business/settings')
      .set('Cookie', [`session=${rawSessionToken}`, `csrf_token=${csrfToken}`])
      .set('x-csrf-token', csrfToken)
      .send({
        allowPublicReviews: true,
        isSuperAdmin: true,
        planLevel: 'unlimited',
      });

    expect(badSettingsRes.status).toBe(400);
  });

  it('Multi-Tenant Isolation: Business A cannot access or modify Business B', async () => {
    // Create Owner A & Business A
    const tenantA = await createAuthenticatedOwner('ownerA@dental.com', 'Downtown Dental Care');

    // Create Owner B & Business B
    const tenantB = await createAuthenticatedOwner('ownerB@garage.com', 'Ace Auto Mechanics');

    // 1. Tenant A reads profile -> Receives Business A
    const resA = await request(app)
      .get('/api/v1/business')
      .set('Cookie', [`session=${tenantA.rawSessionToken}`]);

    expect(resA.status).toBe(200);
    expect(resA.body.data.name).toBe('Downtown Dental Care');
    expect(resA.body.data._id).toBe(tenantA.business._id.toString());
    expect(resA.body.data._id).not.toBe(tenantB.business._id.toString());

    // 2. Tenant B reads profile -> Receives Business B
    const resB = await request(app)
      .get('/api/v1/business')
      .set('Cookie', [`session=${tenantB.rawSessionToken}`]);

    expect(resB.status).toBe(200);
    expect(resB.body.data.name).toBe('Ace Auto Mechanics');
    expect(resB.body.data._id).toBe(tenantB.business._id.toString());

    // 3. Tenant A attempts to update Business B by tampering request
    // Even if Tenant A sends Business B's ID in body, server scopes by session
    const tamperRes = await request(app)
      .patch('/api/v1/business')
      .set('Cookie', [`session=${tenantA.rawSessionToken}`, `csrf_token=${tenantA.csrfToken}`])
      .set('x-csrf-token', tenantA.csrfToken)
      .send({
        name: 'Hacked Downtown Dental',
      });

    expect(tamperRes.status).toBe(200);
    expect(tamperRes.body.data.name).toBe('Hacked Downtown Dental');

    // Verify Business B was completely untouched
    const checkB = await Business.findById(tenantB.business._id);
    expect(checkB?.name).toBe('Ace Auto Mechanics');
  });

  it('Suspended business or suspended user is denied access', async () => {
    const { business, user, rawSessionToken } = await createAuthenticatedOwner(
      'suspended@test.com',
      'Suspended Business',
    );

    // 1. Suspend the business
    business.status = 'suspended';
    await business.save();

    const resSuspendedBiz = await request(app)
      .get('/api/v1/business')
      .set('Cookie', [`session=${rawSessionToken}`]);

    expect(resSuspendedBiz.status).toBe(403);
    expect(resSuspendedBiz.body.error.code).toBe('FORBIDDEN');
    expect(resSuspendedBiz.body.error.message).toContain('suspended');

    // Restore business, but suspend the user
    business.status = 'active';
    await business.save();

    user.status = 'suspended';
    await user.save();

    const resSuspendedUser = await request(app)
      .get('/api/v1/business')
      .set('Cookie', [`session=${rawSessionToken}`]);

    expect(resSuspendedUser.status).toBe(403);
    expect(resSuspendedUser.body.error.code).toBe('FORBIDDEN');
  });
});
