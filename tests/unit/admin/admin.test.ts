import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase,
  clearTestDatabase,
  teardownTestDatabase,
} from '../../helpers/db-helper.js';
import { AuditLog } from '../../../src/modules/admin/models/audit-log.model.js';
import {
  createPlanSchema,
  updatePlanSchema,
  adminBusinessQuerySchema,
  adminSubscriptionQuerySchema,
  adminAuditLogQuerySchema,
} from '../../../src/modules/admin/admin.validation.js';
import { Types } from 'mongoose';

describe('Admin Unit Tests (Phase 10)', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
  });

  describe('AuditLog Model', () => {
    it('creates an audit log record with valid fields', async () => {
      const actorId = new Types.ObjectId();
      const log = await AuditLog.create({
        actorId,
        actorEmail: 'admin@platform.com',
        action: 'plan.created',
        targetType: 'Plan',
        targetId: 'enterprise',
        metadata: { price: 500000 },
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      });

      expect(log).toBeDefined();
      expect(log.actorEmail).toBe('admin@platform.com');
      expect(log.action).toBe('plan.created');
      expect(log.createdAt).toBeInstanceOf(Date);
    });

    it('requires actorId, actorEmail, action, and targetType', async () => {
      await expect(
        AuditLog.create({
          action: 'plan.created',
        }),
      ).rejects.toThrow();
    });
  });

  describe('Admin Validation Schemas', () => {
    it('validates valid createPlanSchema', () => {
      const valid = createPlanSchema.safeParse({
        planId: 'enterprise-custom',
        name: 'Enterprise Custom',
        description: 'Custom corporate plan',
        price: 999900,
        currency: 'INR',
        interval: 'yearly',
        isPublished: true,
        features: ['Custom onboarding', 'Dedicated SLA'],
        limits: {
          maxCampaigns: 50,
          maxMonthlyScans: 20000,
          aiAssistanceEnabled: true,
        },
        sortOrder: 4,
      });

      expect(valid.success).toBe(true);
    });

    it('rejects invalid planId format (spaces, uppercase, special chars)', () => {
      const invalid = createPlanSchema.safeParse({
        planId: 'Enterprise Custom!',
        name: 'Enterprise Custom',
        description: 'Custom corporate plan',
        price: 999900,
        features: ['Feature 1'],
        limits: { maxCampaigns: 10, maxMonthlyScans: 500, aiAssistanceEnabled: true },
      });

      expect(invalid.success).toBe(false);
    });

    it('rejects negative price and non-integer price', () => {
      const negative = createPlanSchema.safeParse({
        planId: 'test-plan',
        name: 'Test Plan',
        description: 'Test',
        price: -100,
        features: ['Feature 1'],
        limits: { maxCampaigns: 10, maxMonthlyScans: 500, aiAssistanceEnabled: true },
      });
      expect(negative.success).toBe(false);

      const floatPrice = createPlanSchema.safeParse({
        planId: 'test-plan',
        name: 'Test Plan',
        description: 'Test',
        price: 99.99, // Should be integer minor units
        features: ['Feature 1'],
        limits: { maxCampaigns: 10, maxMonthlyScans: 500, aiAssistanceEnabled: true },
      });
      expect(floatPrice.success).toBe(false);
    });

    it('enforces strict schema rejection on unauthorized extra properties', () => {
      const tampered = createPlanSchema.safeParse({
        planId: 'valid-slug',
        name: 'Valid Name',
        description: 'Valid description',
        price: 50000,
        features: ['Feature 1'],
        limits: { maxCampaigns: 5, maxMonthlyScans: 1000, aiAssistanceEnabled: true },
        internalSecretKey: 'malicious-injection',
      });

      expect(tampered.success).toBe(false);
    });

    it('validates partial updatePlanSchema', () => {
      const valid = updatePlanSchema.safeParse({
        name: 'Updated Name',
        price: 129900,
        isPublished: false,
      });

      expect(valid.success).toBe(true);
    });

    it('bounds query pagination parameters', () => {
      const businessQuery = adminBusinessQuerySchema.parse({ page: '2', limit: '25' });
      expect(businessQuery.page).toBe(2);
      expect(businessQuery.limit).toBe(25);

      const subQuery = adminSubscriptionQuerySchema.parse({ status: 'active' });
      expect(subQuery.status).toBe('active');

      const auditQuery = adminAuditLogQuerySchema.parse({ action: 'plan.updated' });
      expect(auditQuery.action).toBe('plan.updated');
    });
  });
});
