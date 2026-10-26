import { randomBytes, randomUUID } from 'node:crypto';
import mongoose, { type Types } from 'mongoose';
import { QrCampaign, type IQrCampaignDocument } from './models/qr-campaign.model.js';
import { QrEvent } from './models/qr-event.model.js';
import { qrGeneratorService } from './qr-generator.service.js';
import { getStorageProvider } from '../../integrations/storage/index.js';
import { validateImageSignature } from '../../common/utils/file-validator.js';
import { NotFoundError, ValidationError } from '../../common/errors/app-error.js';
import { logger } from '../../common/utils/logger.js';
import type {
  CreateQrCampaignInput,
  UpdateQrCampaignInput,
  ListQrCampaignsQuery,
} from './qr-campaign.validation.js';

export class QrCampaignService {
  private storage = getStorageProvider();

  /**
   * Generates a cryptographically random, collision-safe public token.
   */
  private async generateUniquePublicToken(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const token = randomBytes(12).toString('hex');
      const existing = await QrCampaign.findOne({ publicToken: token });
      if (!existing) {
        return token;
      }
    }
    throw new Error('Failed to generate a unique public campaign token.');
  }

  /**
   * Creates a new QR campaign with optional safe logo upload.
   */
  async createCampaign(
    businessId: Types.ObjectId,
    input: CreateQrCampaignInput,
    logoFile?: Express.Multer.File,
  ): Promise<IQrCampaignDocument> {
    const publicToken = await this.generateUniquePublicToken();

    let logoKey: string | null = null;
    let logoUrl: string | null = null;

    if (logoFile) {
      const { extension, mimeType } = validateImageSignature(logoFile.buffer);
      logoKey = `logo-${businessId.toString()}-${randomUUID()}${extension}`;
      const uploadResult = await this.storage.uploadFile(logoKey, logoFile.buffer, mimeType);
      logoUrl = uploadResult.publicUrl;
    }

    const campaign = new QrCampaign({
      businessId,
      title: input.title,
      heading: input.heading,
      description: input.description || null,
      branding: {
        primaryColor: input.branding?.primaryColor || '#2563EB',
        backgroundColor: input.branding?.backgroundColor || '#FFFFFF',
        logoKey,
        logoUrl,
      },
      status: 'active',
      publicToken,
    });

    await campaign.save();
    return campaign;
  }

  /**
   * Lists campaigns for the authenticated tenant with pagination and filtering.
   */
  async listCampaigns(
    businessId: Types.ObjectId,
    query: ListQrCampaignsQuery,
  ): Promise<{ campaigns: IQrCampaignDocument[]; total: number; page: number; limit: number }> {
    const filter: Record<string, unknown> = { businessId };
    if (query.status) {
      filter.status = query.status;
    }

    const skip = (query.page - 1) * query.limit;

    const [campaigns, total] = await Promise.all([
      QrCampaign.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit),
      QrCampaign.countDocuments(filter),
    ]);

    return {
      campaigns,
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /**
   * Retrieves a campaign ensuring tenant boundary isolation.
   */
  async getCampaignById(
    businessId: Types.ObjectId,
    campaignId: string,
  ): Promise<IQrCampaignDocument> {
    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
      throw new ValidationError(`Invalid campaign ID format '${campaignId}'.`);
    }

    const campaign = await QrCampaign.findOne({
      _id: campaignId,
      businessId,
    });

    if (!campaign) {
      throw new NotFoundError('QR Campaign not found or access unauthorized.');
    }

    return campaign;
  }

  /**
   * Updates permitted campaign fields and optionally replaces brand logo.
   */
  async updateCampaign(
    businessId: Types.ObjectId,
    campaignId: string,
    input: UpdateQrCampaignInput,
    logoFile?: Express.Multer.File,
  ): Promise<IQrCampaignDocument> {
    const campaign = await this.getCampaignById(businessId, campaignId);

    if (input.title !== undefined) campaign.title = input.title;
    if (input.heading !== undefined) campaign.heading = input.heading;
    if (input.description !== undefined) campaign.description = input.description || null;

    if (input.branding) {
      if (input.branding.primaryColor !== undefined) {
        campaign.branding.primaryColor = input.branding.primaryColor;
      }
      if (input.branding.backgroundColor !== undefined) {
        campaign.branding.backgroundColor = input.branding.backgroundColor;
      }
    }

    if (logoFile) {
      const { extension, mimeType } = validateImageSignature(logoFile.buffer);
      // Clean up previous logo if it exists
      if (campaign.branding.logoKey) {
        await this.storage.deleteFile(campaign.branding.logoKey).catch(() => {});
      }

      const newKey = `logo-${businessId.toString()}-${randomUUID()}${extension}`;
      const uploadResult = await this.storage.uploadFile(newKey, logoFile.buffer, mimeType);
      campaign.branding.logoKey = newKey;
      campaign.branding.logoUrl = uploadResult.publicUrl;
    }

    await campaign.save();
    return campaign;
  }

  /**
   * Deactivates a campaign.
   */
  async deactivateCampaign(
    businessId: Types.ObjectId,
    campaignId: string,
  ): Promise<IQrCampaignDocument> {
    const campaign = await this.getCampaignById(businessId, campaignId);
    campaign.status = 'inactive';
    await campaign.save();
    return campaign;
  }

  /**
   * Exports a QR code as PNG, SVG, or PDF with proper byte-level payload formatting.
   */
  async exportCampaign(
    businessId: Types.ObjectId,
    campaignId: string,
    format: 'png' | 'svg' | 'pdf',
  ): Promise<{ buffer: Buffer | string; contentType: string; filename: string }> {
    const campaign = await this.getCampaignById(businessId, campaignId);
    const sanitizedTitle = campaign.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    if (format === 'png') {
      const pngBuffer = await qrGeneratorService.generatePng(campaign);
      return {
        buffer: pngBuffer,
        contentType: 'image/png',
        filename: `qr-${sanitizedTitle}.png`,
      };
    }

    if (format === 'svg') {
      const svgString = await qrGeneratorService.generateSvg(campaign);
      return {
        buffer: svgString,
        contentType: 'image/svg+xml',
        filename: `qr-${sanitizedTitle}.svg`,
      };
    }

    if (format === 'pdf') {
      const pdfBuffer = await qrGeneratorService.generatePdf(campaign);
      return {
        buffer: pdfBuffer,
        contentType: 'application/pdf',
        filename: `qr-${sanitizedTitle}.pdf`,
      };
    }

    throw new ValidationError(`Unsupported export format '${format}'.`);
  }

  /**
   * Public scan event recording. Validates active campaign token and records event.
   */
  async recordPublicScan(
    publicToken: string,
    reqMeta: { referrer?: string; language?: string },
  ): Promise<{
    campaign: {
      title: string;
      heading: string;
      description?: string | null;
      branding: {
        primaryColor: string;
        backgroundColor: string;
        logoUrl?: string | null;
      };
    };
  }> {
    const campaign = await QrCampaign.findOne({ publicToken, status: 'active' });

    if (!campaign) {
      throw new NotFoundError('QR campaign not found or is currently inactive.');
    }

    // Atomically increment scan counter
    await QrCampaign.findByIdAndUpdate(campaign._id, { $inc: { scanCount: 1 } });

    // Asynchronously record scan event without blocking public feedback resolution
    QrEvent.create({
      campaignId: campaign._id,
      businessId: campaign.businessId,
      eventType: 'scan',
      metadata: {
        referrer: reqMeta.referrer ? reqMeta.referrer.slice(0, 200) : undefined,
        language: reqMeta.language ? reqMeta.language.slice(0, 10) : undefined,
      },
    }).catch((err: Error) => {
      logger.error({ err }, 'Failed to record QR scan event in background');
    });

    return {
      campaign: {
        title: campaign.title,
        heading: campaign.heading,
        description: campaign.description,
        branding: {
          primaryColor: campaign.branding.primaryColor,
          backgroundColor: campaign.branding.backgroundColor,
          logoUrl: campaign.branding.logoUrl,
        },
      },
    };
  }
}

export const qrCampaignService = new QrCampaignService();
