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

// Minimal valid 1x1 pixel PNG (68 bytes)
const VALID_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

describe('QR Campaign Management & Export Integration Tests', () => {
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

  async function createAuthenticatedOwner(email: string, businessName: string) {
    await authService.requestSignupOtp({
      email,
      name: 'Owner Name',
      businessName,
      category: 'Hospitality',
      consentAccepted: true,
    });

    const otp = mockEmailProvider.getLatestOtpFor(email)!;
    const { user, business, rawSessionToken, csrfToken } = await authService.verifySignupOtp(
      { email, otp },
      { userAgent: 'test-agent' },
    );

    return { user, business, rawSessionToken, csrfToken };
  }

  describe('Campaign Creation (POST /api/v1/qr-campaigns)', () => {
    it('should return 401 when request is unauthenticated', async () => {
      const res = await request(app).post('/api/v1/qr-campaigns').send({
        title: 'Table Tent QR',
        heading: 'Scan to leave a review',
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should create a campaign with defaults when valid data is provided', async () => {
      const { rawSessionToken, csrfToken } = await createAuthenticatedOwner(
        'owner@cafe.com',
        'Morning Brew Cafe',
      );

      const res = await request(app)
        .post('/api/v1/qr-campaigns')
        .set('Cookie', [`session=${rawSessionToken}`, `csrf_token=${csrfToken}`])
        .set('x-csrf-token', csrfToken)
        .send({
          title: 'Front Counter Stand',
          heading: 'How was your coffee today?',
          description: 'Help us improve our morning service',
          branding: {
            primaryColor: '#10B981',
            backgroundColor: '#F9FAFB',
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Front Counter Stand');
      expect(res.body.data.heading).toBe('How was your coffee today?');
      expect(res.body.data.branding.primaryColor).toBe('#10B981');
      expect(res.body.data.branding.backgroundColor).toBe('#F9FAFB');
      expect(res.body.data.status).toBe('active');
      expect(res.body.data.publicToken).toBeDefined();
      expect(typeof res.body.data.publicToken).toBe('string');
      expect(res.body.data.publicToken.length).toBe(24); // 12 bytes hex
    });

    it('should create a campaign with a valid PNG logo upload', async () => {
      const { rawSessionToken, csrfToken } = await createAuthenticatedOwner(
        'owner2@cafe.com',
        'Artisan Roasters',
      );

      const res = await request(app)
        .post('/api/v1/qr-campaigns')
        .set('Cookie', [`session=${rawSessionToken}`, `csrf_token=${csrfToken}`])
        .set('x-csrf-token', csrfToken)
        .field('title', 'Branded Table Tent')
        .field('heading', 'Rate our roast')
        .attach('logo', VALID_PNG_BUFFER, {
          filename: 'logo.png',
          contentType: 'image/png',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.branding.logoKey).toBeDefined();
      expect(res.body.data.branding.logoUrl).toContain('/api/v1/storage/files/');
    });

    it('should reject invalid hex color format', async () => {
      const { rawSessionToken, csrfToken } = await createAuthenticatedOwner(
        'owner3@cafe.com',
        'Tea House',
      );

      const res = await request(app)
        .post('/api/v1/qr-campaigns')
        .set('Cookie', [`session=${rawSessionToken}`, `csrf_token=${csrfToken}`])
        .set('x-csrf-token', csrfToken)
        .send({
          title: 'Invalid Colors',
          heading: 'Scan here',
          branding: {
            primaryColor: 'not-a-color',
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject text exceeding maximum permitted length', async () => {
      const { rawSessionToken, csrfToken } = await createAuthenticatedOwner(
        'owner4@cafe.com',
        'Bakery',
      );

      const res = await request(app)
        .post('/api/v1/qr-campaigns')
        .set('Cookie', [`session=${rawSessionToken}`, `csrf_token=${csrfToken}`])
        .set('x-csrf-token', csrfToken)
        .send({
          title: 'A'.repeat(101), // Max 100
          heading: 'Scan here',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject logo uploads that fail magic bytes validation (e.g. SVG disguised as PNG)', async () => {
      const { rawSessionToken, csrfToken } = await createAuthenticatedOwner(
        'owner5@cafe.com',
        'Diner',
      );
      const fakeSvgBuffer = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      );

      const res = await request(app)
        .post('/api/v1/qr-campaigns')
        .set('Cookie', [`session=${rawSessionToken}`, `csrf_token=${csrfToken}`])
        .set('x-csrf-token', csrfToken)
        .field('title', 'Exploit Attempt')
        .field('heading', 'Rate us')
        .attach('logo', fakeSvgBuffer, {
          filename: 'exploit.png',
          contentType: 'image/png',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Campaign Listing, Retrieval & Pagination (GET /api/v1/qr-campaigns)', () => {
    it('should list campaigns belonging exclusively to authenticated tenant', async () => {
      const tenantA = await createAuthenticatedOwner('tenantA@bistro.com', 'Bistro A');
      const tenantB = await createAuthenticatedOwner('tenantB@bistro.com', 'Bistro B');

      // Create 2 campaigns for Tenant A
      await request(app)
        .post('/api/v1/qr-campaigns')
        .set('Cookie', [`session=${tenantA.rawSessionToken}`, `csrf_token=${tenantA.csrfToken}`])
        .set('x-csrf-token', tenantA.csrfToken)
        .send({ title: 'Tenant A - Campaign 1', heading: 'Scan 1' });

      await request(app)
        .post('/api/v1/qr-campaigns')
        .set('Cookie', [`session=${tenantA.rawSessionToken}`, `csrf_token=${tenantA.csrfToken}`])
        .set('x-csrf-token', tenantA.csrfToken)
        .send({ title: 'Tenant A - Campaign 2', heading: 'Scan 2' });

      // Create 1 campaign for Tenant B
      await request(app)
        .post('/api/v1/qr-campaigns')
        .set('Cookie', [`session=${tenantB.rawSessionToken}`, `csrf_token=${tenantB.csrfToken}`])
        .set('x-csrf-token', tenantB.csrfToken)
        .send({ title: 'Tenant B - Campaign 1', heading: 'Scan B' });

      // Tenant A listing
      const resA = await request(app)
        .get('/api/v1/qr-campaigns')
        .set('Cookie', [`session=${tenantA.rawSessionToken}`]);

      expect(resA.status).toBe(200);
      expect(resA.body.data.length).toBe(2);
      expect(resA.body.meta.total).toBe(2);
      expect(resA.body.data.every((c: { title: string }) => c.title.startsWith('Tenant A'))).toBe(
        true,
      );

      // Tenant B listing
      const resB = await request(app)
        .get('/api/v1/qr-campaigns')
        .set('Cookie', [`session=${tenantB.rawSessionToken}`]);

      expect(resB.status).toBe(200);
      expect(resB.body.data.length).toBe(1);
      expect(resB.body.meta.total).toBe(1);
      expect(resB.body.data[0].title).toBe('Tenant B - Campaign 1');
    });

    it('should support pagination query parameters', async () => {
      const { rawSessionToken, csrfToken } = await createAuthenticatedOwner(
        'paginated@test.com',
        'Pagination Cafe',
      );

      for (let i = 1; i <= 3; i++) {
        await request(app)
          .post('/api/v1/qr-campaigns')
          .set('Cookie', [`session=${rawSessionToken}`, `csrf_token=${csrfToken}`])
          .set('x-csrf-token', csrfToken)
          .send({ title: `Campaign ${i}`, heading: 'Rate us' });
      }

      const res = await request(app)
        .get('/api/v1/qr-campaigns?page=1&limit=2')
        .set('Cookie', [`session=${rawSessionToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.limit).toBe(2);
      expect(res.body.meta.total).toBe(3);
      expect(res.body.meta.totalPages).toBe(2);
    });

    it('should retrieve single campaign by ID', async () => {
      const { rawSessionToken, csrfToken } = await createAuthenticatedOwner(
        'single@test.com',
        'Single Cafe',
      );

      const createRes = await request(app)
        .post('/api/v1/qr-campaigns')
        .set('Cookie', [`session=${rawSessionToken}`, `csrf_token=${csrfToken}`])
        .set('x-csrf-token', csrfToken)
        .send({ title: 'Specific Stand', heading: 'Rate us' });

      const campaignId = createRes.body.data._id;

      const getRes = await request(app)
        .get(`/api/v1/qr-campaigns/${campaignId}`)
        .set('Cookie', [`session=${rawSessionToken}`]);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data._id).toBe(campaignId);
      expect(getRes.body.data.title).toBe('Specific Stand');
    });
  });

  describe('Campaign Update & Deactivation (PATCH & POST /deactivate)', () => {
    it('should update allowed fields (title, heading, branding)', async () => {
      const { rawSessionToken, csrfToken } = await createAuthenticatedOwner(
        'update@test.com',
        'Update Cafe',
      );

      const createRes = await request(app)
        .post('/api/v1/qr-campaigns')
        .set('Cookie', [`session=${rawSessionToken}`, `csrf_token=${csrfToken}`])
        .set('x-csrf-token', csrfToken)
        .send({ title: 'Old Title', heading: 'Old Heading' });

      const campaignId = createRes.body.data._id;

      const updateRes = await request(app)
        .patch(`/api/v1/qr-campaigns/${campaignId}`)
        .set('Cookie', [`session=${rawSessionToken}`, `csrf_token=${csrfToken}`])
        .set('x-csrf-token', csrfToken)
        .send({
          title: 'New Title',
          heading: 'New Heading',
          branding: {
            primaryColor: '#7C3AED',
          },
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.title).toBe('New Title');
      expect(updateRes.body.data.heading).toBe('New Heading');
      expect(updateRes.body.data.branding.primaryColor).toBe('#7C3AED');
    });

    it('should reject mass assignment attempts on businessId and publicToken', async () => {
      const { rawSessionToken, csrfToken } = await createAuthenticatedOwner(
        'mass@test.com',
        'Mass Cafe',
      );

      const createRes = await request(app)
        .post('/api/v1/qr-campaigns')
        .set('Cookie', [`session=${rawSessionToken}`, `csrf_token=${csrfToken}`])
        .set('x-csrf-token', csrfToken)
        .send({ title: 'Mass Campaign', heading: 'Heading' });

      const campaignId = createRes.body.data._id;
      const originalToken = createRes.body.data.publicToken;

      const updateRes = await request(app)
        .patch(`/api/v1/qr-campaigns/${campaignId}`)
        .set('Cookie', [`session=${rawSessionToken}`, `csrf_token=${csrfToken}`])
        .set('x-csrf-token', csrfToken)
        .send({
          title: 'Updated Mass Campaign',
          publicToken: 'attacker-controlled-token',
          businessId: '65f123456789abcdef012345',
        });

      // Strict schema rejects non-allowlisted properties with 400
      expect(updateRes.status).toBe(400);
      expect(updateRes.body.error.code).toBe('VALIDATION_ERROR');

      // Verify database record was not altered
      const record = await QrCampaign.findById(campaignId);
      expect(record!.publicToken).toBe(originalToken);
    });

    it('should deactivate a campaign', async () => {
      const { rawSessionToken, csrfToken } = await createAuthenticatedOwner(
        'deact@test.com',
        'Deact Cafe',
      );

      const createRes = await request(app)
        .post('/api/v1/qr-campaigns')
        .set('Cookie', [`session=${rawSessionToken}`, `csrf_token=${csrfToken}`])
        .set('x-csrf-token', csrfToken)
        .send({ title: 'To Deactivate', heading: 'Scan me' });

      const campaignId = createRes.body.data._id;

      const deactRes = await request(app)
        .post(`/api/v1/qr-campaigns/${campaignId}/deactivate`)
        .set('Cookie', [`session=${rawSessionToken}`, `csrf_token=${csrfToken}`])
        .set('x-csrf-token', csrfToken);

      expect(deactRes.status).toBe(200);
      expect(deactRes.body.data.status).toBe('inactive');
    });
  });

  describe('QR Exports (GET /api/v1/qr-campaigns/:id/export)', () => {
    it('should export a valid PNG binary file', async () => {
      const { rawSessionToken, csrfToken } = await createAuthenticatedOwner(
        'export@test.com',
        'Export Cafe',
      );

      const createRes = await request(app)
        .post('/api/v1/qr-campaigns')
        .set('Cookie', [`session=${rawSessionToken}`, `csrf_token=${csrfToken}`])
        .set('x-csrf-token', csrfToken)
        .send({ title: 'Bar Table QR', heading: 'Review our drinks' });

      const campaignId = createRes.body.data._id;

      const res = await request(app)
        .get(`/api/v1/qr-campaigns/${campaignId}/export?format=png`)
        .set('Cookie', [`session=${rawSessionToken}`])
        .responseType('blob');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.headers['content-disposition']).toContain('qr-bar-table-qr.png');

      // Verify PNG magic bytes: \x89PNG\r\n\x1a\n (Buffer hex: 89 50 4E 47 0D 0A 1A 0A)
      const buffer = Buffer.from(res.body);
      expect(buffer[0]).toBe(0x89);
      expect(buffer[1]).toBe(0x50); // P
      expect(buffer[2]).toBe(0x4e); // N
      expect(buffer[3]).toBe(0x47); // G
      expect(buffer[4]).toBe(0x0d);
      expect(buffer[5]).toBe(0x0a);
      expect(buffer[6]).toBe(0x1a);
      expect(buffer[7]).toBe(0x0a);
    });

    it('should export a valid SVG string', async () => {
      const { rawSessionToken, csrfToken } = await createAuthenticatedOwner(
        'export-svg@test.com',
        'SVG Cafe',
      );

      const createRes = await request(app)
        .post('/api/v1/qr-campaigns')
        .set('Cookie', [`session=${rawSessionToken}`, `csrf_token=${csrfToken}`])
        .set('x-csrf-token', csrfToken)
        .send({ title: 'Window Poster', heading: 'Scan from street' });

      const campaignId = createRes.body.data._id;

      const res = await request(app)
        .get(`/api/v1/qr-campaigns/${campaignId}/export?format=svg`)
        .set('Cookie', [`session=${rawSessionToken}`])
        .responseType('blob');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('image/svg+xml');
      expect(res.headers['content-disposition']).toContain('qr-window-poster.svg');

      const svgString = Buffer.from(res.body).toString('utf-8');
      expect(svgString).toContain('<svg');
      expect(svgString).toContain('</svg>');
    });

    it('should export a valid PDF binary file', async () => {
      const { rawSessionToken, csrfToken } = await createAuthenticatedOwner(
        'export-pdf@test.com',
        'PDF Cafe',
      );

      const createRes = await request(app)
        .post('/api/v1/qr-campaigns')
        .set('Cookie', [`session=${rawSessionToken}`, `csrf_token=${csrfToken}`])
        .set('x-csrf-token', csrfToken)
        .send({ title: 'A4 Printable Table Tent', heading: 'Leave your feedback' });

      const campaignId = createRes.body.data._id;

      const res = await request(app)
        .get(`/api/v1/qr-campaigns/${campaignId}/export?format=pdf`)
        .set('Cookie', [`session=${rawSessionToken}`])
        .responseType('blob');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toContain('qr-a4-printable-table-tent.pdf');

      // Verify PDF magic bytes: %PDF- (Buffer starts with "%PDF-")
      const buffer = Buffer.from(res.body);
      const signature = buffer.subarray(0, 5).toString('ascii');
      expect(signature).toBe('%PDF-');
    });

    it('should reject invalid or unsupported export formats', async () => {
      const { rawSessionToken, csrfToken } = await createAuthenticatedOwner(
        'bad-export@test.com',
        'Bad Export',
      );

      const createRes = await request(app)
        .post('/api/v1/qr-campaigns')
        .set('Cookie', [`session=${rawSessionToken}`, `csrf_token=${csrfToken}`])
        .set('x-csrf-token', csrfToken)
        .send({ title: 'Invalid Export', heading: 'Test' });

      const campaignId = createRes.body.data._id;

      const res = await request(app)
        .get(`/api/v1/qr-campaigns/${campaignId}/export?format=exe`)
        .set('Cookie', [`session=${rawSessionToken}`]);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Multi-Tenant Isolation & Cross-Tenant Protection', () => {
    it('should forbid Tenant B from reading Tenant A campaign', async () => {
      const tenantA = await createAuthenticatedOwner('ownerA@corp.com', 'Company A');
      const tenantB = await createAuthenticatedOwner('ownerB@corp.com', 'Company B');

      const createRes = await request(app)
        .post('/api/v1/qr-campaigns')
        .set('Cookie', [`session=${tenantA.rawSessionToken}`, `csrf_token=${tenantA.csrfToken}`])
        .set('x-csrf-token', tenantA.csrfToken)
        .send({ title: 'Confidential Campaign A', heading: 'Top Secret' });

      const campaignId = createRes.body.data._id;

      // Tenant B tries to get Tenant A's campaign
      const getRes = await request(app)
        .get(`/api/v1/qr-campaigns/${campaignId}`)
        .set('Cookie', [`session=${tenantB.rawSessionToken}`]);

      expect(getRes.status).toBe(404);
      expect(getRes.body.error.code).toBe('NOT_FOUND');
    });

    it('should forbid Tenant B from updating or deactivating Tenant A campaign', async () => {
      const tenantA = await createAuthenticatedOwner('ownerA2@corp.com', 'Company A2');
      const tenantB = await createAuthenticatedOwner('ownerB2@corp.com', 'Company B2');

      const createRes = await request(app)
        .post('/api/v1/qr-campaigns')
        .set('Cookie', [`session=${tenantA.rawSessionToken}`, `csrf_token=${tenantA.csrfToken}`])
        .set('x-csrf-token', tenantA.csrfToken)
        .send({ title: 'Campaign A2', heading: 'Do not tamper' });

      const campaignId = createRes.body.data._id;

      // Tenant B tries to update
      const updateRes = await request(app)
        .patch(`/api/v1/qr-campaigns/${campaignId}`)
        .set('Cookie', [`session=${tenantB.rawSessionToken}`, `csrf_token=${tenantB.csrfToken}`])
        .set('x-csrf-token', tenantB.csrfToken)
        .send({ title: 'Tampered Title' });

      expect(updateRes.status).toBe(404);

      // Tenant B tries to deactivate
      const deactRes = await request(app)
        .post(`/api/v1/qr-campaigns/${campaignId}/deactivate`)
        .set('Cookie', [`session=${tenantB.rawSessionToken}`, `csrf_token=${tenantB.csrfToken}`])
        .set('x-csrf-token', tenantB.csrfToken);

      expect(deactRes.status).toBe(404);
    });

    it('should forbid Tenant B from exporting Tenant A campaign QR code', async () => {
      const tenantA = await createAuthenticatedOwner('ownerA3@corp.com', 'Company A3');
      const tenantB = await createAuthenticatedOwner('ownerB3@corp.com', 'Company B3');

      const createRes = await request(app)
        .post('/api/v1/qr-campaigns')
        .set('Cookie', [`session=${tenantA.rawSessionToken}`, `csrf_token=${tenantA.csrfToken}`])
        .set('x-csrf-token', tenantA.csrfToken)
        .send({ title: 'Campaign A3', heading: 'Private QR' });

      const campaignId = createRes.body.data._id;

      const exportRes = await request(app)
        .get(`/api/v1/qr-campaigns/${campaignId}/export?format=png`)
        .set('Cookie', [`session=${tenantB.rawSessionToken}`]);

      expect(exportRes.status).toBe(404);
    });
  });

  describe('Public QR Scan Recording (POST /api/v1/public/qr/:token/scan)', () => {
    it('should record a scan, increment scanCount, and return public campaign view', async () => {
      const { rawSessionToken, csrfToken } = await createAuthenticatedOwner(
        'public@test.com',
        'Public Diner',
      );

      const createRes = await request(app)
        .post('/api/v1/qr-campaigns')
        .set('Cookie', [`session=${rawSessionToken}`, `csrf_token=${csrfToken}`])
        .set('x-csrf-token', csrfToken)
        .send({
          title: 'Diner Table 4',
          heading: 'How did you enjoy your burger?',
          description: 'Leave quick feedback to help us improve',
        });

      const token = createRes.body.data.publicToken;
      const campaignId = createRes.body.data._id;

      const scanRes = await request(app)
        .post(`/api/v1/public/qr/${token}/scan`)
        .set('Referer', 'https://qr-scanner.app/scan')
        .set('Accept-Language', 'en-US,en;q=0.9');

      expect(scanRes.status).toBe(200);
      expect(scanRes.body.success).toBe(true);
      expect(scanRes.body.data.title).toBe('Diner Table 4');
      expect(scanRes.body.data.heading).toBe('How did you enjoy your burger?');
      // Must not leak internal business IDs or private database internals in public response
      expect(scanRes.body.data.businessId).toBeUndefined();
      expect(scanRes.body.data._id).toBeUndefined();

      // Verify scan counter was incremented in database
      const updatedCampaign = await QrCampaign.findById(campaignId);
      expect(updatedCampaign!.scanCount).toBe(1);

      // Verify QrEvent was recorded
      const event = await QrEvent.findOne({ campaignId });
      expect(event).not.toBeNull();
      expect(event!.eventType).toBe('scan');
      expect(event!.metadata?.referrer).toBe('https://qr-scanner.app/scan');
    });

    it('should return 404 when scanning an inactive campaign', async () => {
      const { rawSessionToken, csrfToken } = await createAuthenticatedOwner(
        'inactive@test.com',
        'Inactive Diner',
      );

      const createRes = await request(app)
        .post('/api/v1/qr-campaigns')
        .set('Cookie', [`session=${rawSessionToken}`, `csrf_token=${csrfToken}`])
        .set('x-csrf-token', csrfToken)
        .send({ title: 'Closed Patio', heading: 'Scan patio' });

      const campaignId = createRes.body.data._id;
      const token = createRes.body.data.publicToken;

      // Deactivate campaign
      await request(app)
        .post(`/api/v1/qr-campaigns/${campaignId}/deactivate`)
        .set('Cookie', [`session=${rawSessionToken}`, `csrf_token=${csrfToken}`])
        .set('x-csrf-token', csrfToken);

      // Scanning deactivated campaign must return 404
      const scanRes = await request(app).post(`/api/v1/public/qr/${token}/scan`);

      expect(scanRes.status).toBe(404);
      expect(scanRes.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 404 for an invalid or non-existent token', async () => {
      const res = await request(app).post('/api/v1/public/qr/nonexistenttoken1234567890/scan');
      expect(res.status).toBe(404);
    });
  });

  describe('Storage File Endpoint (GET /api/v1/storage/files/:key)', () => {
    it('should serve an uploaded logo with proper cache and content-type headers', async () => {
      const { rawSessionToken, csrfToken } = await createAuthenticatedOwner(
        'logo-serve@test.com',
        'Logo Cafe',
      );

      const createRes = await request(app)
        .post('/api/v1/qr-campaigns')
        .set('Cookie', [`session=${rawSessionToken}`, `csrf_token=${csrfToken}`])
        .set('x-csrf-token', csrfToken)
        .field('title', 'Served Logo Test')
        .field('heading', 'Rate us')
        .attach('logo', VALID_PNG_BUFFER, {
          filename: 'munch.png',
          contentType: 'image/png',
        });

      const logoKey = createRes.body.data.branding.logoKey;
      expect(logoKey).toBeDefined();

      const serveRes = await request(app).get(`/api/v1/storage/files/${logoKey}`);
      expect(serveRes.status).toBe(200);
      expect(serveRes.headers['content-type']).toBe('image/png');
      expect(serveRes.headers['cache-control']).toBe('public, max-age=86400');
    });

    it('should return 404 for non-existent file key', async () => {
      const res = await request(app).get('/api/v1/storage/files/missing-file.png');
      expect(res.status).toBe(404);
    });
  });
});
