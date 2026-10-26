import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { Business } from '../../../src/modules/businesses/business.model.js';

describe('Business Model Schema Validation Tests', () => {
  it('should validate a valid business with default branding and settings', async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const validBusiness = new Business({
      name: 'Acme Cafe & Bakery',
      category: 'Restaurant',
      ownerId,
    });

    await expect(validBusiness.validate()).resolves.toBeUndefined();
    expect(validBusiness.name).toBe('Acme Cafe & Bakery');
    expect(validBusiness.status).toBe('active');
    expect(validBusiness.branding.primaryColor).toBe('#2563EB');
    expect(validBusiness.branding.secondaryColor).toBe('#1E293B');
    expect(validBusiness.settings.allowPublicReviews).toBe(true);
  });

  it('should fail validation when required fields are missing', async () => {
    const invalidBusiness = new Business({});

    await expect(invalidBusiness.validate()).rejects.toThrow();
  });

  it('should fail validation when hex color format is invalid', async () => {
    const invalidBusiness = new Business({
      name: 'Modern Dental',
      category: 'Healthcare',
      ownerId: new mongoose.Types.ObjectId(),
      branding: {
        primaryColor: 'not-a-hex-color',
      },
    });

    await expect(invalidBusiness.validate()).rejects.toThrow(
      'Primary color must be a valid hex color code',
    );
  });

  it('should fail validation when notification email format is invalid', async () => {
    const invalidBusiness = new Business({
      name: 'Modern Dental',
      category: 'Healthcare',
      ownerId: new mongoose.Types.ObjectId(),
      settings: {
        notificationEmail: 'invalid-email',
      },
    });

    await expect(invalidBusiness.validate()).rejects.toThrow(
      'Please provide a valid notification email address',
    );
  });
});
