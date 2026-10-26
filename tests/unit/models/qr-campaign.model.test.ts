import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { QrCampaign } from '../../../src/modules/qr-campaigns/models/qr-campaign.model.js';
import { QrEvent } from '../../../src/modules/qr-campaigns/models/qr-event.model.js';

describe('QR Campaign & Event Schema Validation Tests', () => {
  it('should validate a valid QR campaign with defaults', async () => {
    const campaign = new QrCampaign({
      businessId: new mongoose.Types.ObjectId(),
      title: 'Summer Feedback 2026',
      heading: 'Tell us about your dining experience',
      publicToken: 'a1b2c3d4e5f6',
    });

    await expect(campaign.validate()).resolves.toBeUndefined();
    expect(campaign.status).toBe('active');
    expect(campaign.scanCount).toBe(0);
    expect(campaign.branding.primaryColor).toBe('#2563EB');
    expect(campaign.branding.backgroundColor).toBe('#FFFFFF');
  });

  it('should fail validation when required fields are missing', async () => {
    const invalidCampaign = new QrCampaign({});
    await expect(invalidCampaign.validate()).rejects.toThrow();
  });

  it('should fail validation when primaryColor is not a valid hex color', async () => {
    const campaign = new QrCampaign({
      businessId: new mongoose.Types.ObjectId(),
      title: 'Summer Feedback 2026',
      heading: 'Tell us about your dining experience',
      publicToken: 'a1b2c3d4e5f6',
      branding: {
        primaryColor: 'invalid-color',
      },
    });

    await expect(campaign.validate()).rejects.toThrow('Primary color must be a valid hex color');
  });

  it('should fail validation when title exceeds maximum length (100 chars)', async () => {
    const campaign = new QrCampaign({
      businessId: new mongoose.Types.ObjectId(),
      title: 'A'.repeat(101),
      heading: 'Tell us about your dining experience',
      publicToken: 'a1b2c3d4e5f6',
    });

    await expect(campaign.validate()).rejects.toThrow();
  });

  it('should validate a privacy-conscious QrEvent document', async () => {
    const event = new QrEvent({
      campaignId: new mongoose.Types.ObjectId(),
      businessId: new mongoose.Types.ObjectId(),
      eventType: 'scan',
      metadata: {
        referrer: 'https://example.com/qr',
        language: 'en-US',
      },
    });

    await expect(event.validate()).resolves.toBeUndefined();
    expect(event.eventType).toBe('scan');
  });

  it('should fail QrEvent validation if campaignId is missing', async () => {
    const invalidEvent = new QrEvent({
      eventType: 'scan',
    });

    await expect(invalidEvent.validate()).rejects.toThrow();
  });
});
