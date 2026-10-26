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
import { feedbackService } from '../../src/modules/feedbacks/feedback.service.js';

describe('Customer Directory Integration Tests (GET /api/v1/feedback/customers)', () => {
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

  async function createOwnerWithCampaign(email: string, businessName: string) {
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

    const campaign = new QrCampaign({
      businessId: business._id,
      title: 'Main Dining QR',
      heading: 'How was your meal?',
      description: 'Your feedback matters',
      publicToken: 'token_' + Math.random().toString(36).substring(2, 10),
      status: 'active',
    });
    await campaign.save();

    return { user, business, campaign, rawSessionToken, csrfToken };
  }

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/v1/feedback/customers');
    expect(res.status).toBe(401);
  });

  it('returns empty list and zero stats when no customers exist', async () => {
    const { rawSessionToken, csrfToken } = await createOwnerWithCampaign(
      'owner1@test.com',
      'First Bistro',
    );

    const res = await request(app)
      .get('/api/v1/feedback/customers')
      .set('Cookie', [`session=${rawSessionToken}`])
      .set('x-csrf-token', csrfToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.customers).toEqual([]);
    expect(res.body.data.stats).toEqual({
      totalCustomers: 0,
      repeatCustomers: 0,
      averageRating: null,
    });
    expect(res.body.meta.total).toBe(0);
  });

  it('lists verified customers with feedback count, average rating, and repeat indicator', async () => {
    const { campaign, rawSessionToken, csrfToken } = await createOwnerWithCampaign(
      'owner2@test.com',
      'Second Bistro',
    );

    // Customer 1 submits 2 feedbacks (repeat customer)
    await feedbackService.submitFeedback(campaign.publicToken, {
      customerName: 'Alice Green',
      customerEmail: 'alice@example.com',
      rating: 5,
      text: 'Wonderful ambience and service!',
      consentAccepted: true,
    });

    await feedbackService.submitFeedback(campaign.publicToken, {
      customerName: 'Alice Green',
      customerEmail: 'alice@example.com',
      rating: 4,
      text: 'Second visit was just as lovely.',
      consentAccepted: true,
    });

    // Customer 2 submits 1 feedback (first-time customer)
    await feedbackService.submitFeedback(campaign.publicToken, {
      customerName: 'Bob Builder',
      customerPhone: '+919876543210',
      rating: 3,
      text: 'Food was decent, service was a bit slow.',
      consentAccepted: true,
    });

    const res = await request(app)
      .get('/api/v1/feedback/customers')
      .set('Cookie', [`session=${rawSessionToken}`])
      .set('x-csrf-token', csrfToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const { customers, stats } = res.body.data;
    expect(customers).toHaveLength(2);
    expect(stats.totalCustomers).toBe(2);
    expect(stats.repeatCustomers).toBe(1);
    expect(stats.averageRating).toBe(4); // (5 + 4 + 3) / 3 = 4.0

    const alice = customers.find((c: { name: string }) => c.name === 'Alice Green');
    expect(alice).toBeDefined();
    expect(alice.email).toBe('alice@example.com');
    expect(alice.feedbackCount).toBe(2);
    expect(alice.avgRating).toBe(4.5); // (5 + 4) / 2
    expect(alice.isRepeat).toBe(true);

    const bob = customers.find((c: { name: string }) => c.name === 'Bob Builder');
    expect(bob).toBeDefined();
    expect(bob.phone).toBe('+919876543210');
    expect(bob.feedbackCount).toBe(1);
    expect(bob.avgRating).toBe(3);
    expect(bob.isRepeat).toBe(false);
  });

  it('guarantees strict multi-tenant isolation', async () => {
    const ownerA = await createOwnerWithCampaign('ownerA@test.com', 'Tenant Alpha');
    const ownerB = await createOwnerWithCampaign('ownerB@test.com', 'Tenant Beta');

    await feedbackService.submitFeedback(ownerA.campaign.publicToken, {
      customerName: 'Tenant A Customer',
      customerEmail: 'customera@tenant.com',
      rating: 5,
      consentAccepted: true,
    });

    await feedbackService.submitFeedback(ownerB.campaign.publicToken, {
      customerName: 'Tenant B Customer',
      customerEmail: 'customerb@tenant.com',
      rating: 2,
      consentAccepted: true,
    });

    // Owner A should only see Customer A
    const resA = await request(app)
      .get('/api/v1/feedback/customers')
      .set('Cookie', [`session=${ownerA.rawSessionToken}`])
      .set('x-csrf-token', ownerA.csrfToken);

    expect(resA.status).toBe(200);
    expect(resA.body.data.customers).toHaveLength(1);
    expect(resA.body.data.customers[0].name).toBe('Tenant A Customer');
    expect(resA.body.data.stats.totalCustomers).toBe(1);
    expect(resA.body.data.stats.averageRating).toBe(5);

    // Owner B should only see Customer B
    const resB = await request(app)
      .get('/api/v1/feedback/customers')
      .set('Cookie', [`session=${ownerB.rawSessionToken}`])
      .set('x-csrf-token', ownerB.csrfToken);

    expect(resB.status).toBe(200);
    expect(resB.body.data.customers).toHaveLength(1);
    expect(resB.body.data.customers[0].name).toBe('Tenant B Customer');
    expect(resB.body.data.stats.totalCustomers).toBe(1);
    expect(resB.body.data.stats.averageRating).toBe(2);
  });

  it('filters customers by search query (name, email, phone)', async () => {
    const { campaign, rawSessionToken, csrfToken } = await createOwnerWithCampaign(
      'owner3@test.com',
      'Search Test Bistro',
    );

    await feedbackService.submitFeedback(campaign.publicToken, {
      customerName: 'Charlie Brown',
      customerEmail: 'charlie@peanuts.com',
      rating: 5,
      consentAccepted: true,
    });

    await feedbackService.submitFeedback(campaign.publicToken, {
      customerName: 'Diana Prince',
      customerPhone: '+919999988888',
      rating: 4,
      consentAccepted: true,
    });

    // Search by partial email
    const emailSearch = await request(app)
      .get('/api/v1/feedback/customers?search=peanuts')
      .set('Cookie', [`session=${rawSessionToken}`])
      .set('x-csrf-token', csrfToken);

    expect(emailSearch.body.data.customers).toHaveLength(1);
    expect(emailSearch.body.data.customers[0].name).toBe('Charlie Brown');

    // Search by partial phone
    const phoneSearch = await request(app)
      .get('/api/v1/feedback/customers?search=88888')
      .set('Cookie', [`session=${rawSessionToken}`])
      .set('x-csrf-token', csrfToken);

    expect(phoneSearch.body.data.customers).toHaveLength(1);
    expect(phoneSearch.body.data.customers[0].name).toBe('Diana Prince');
  });
});
