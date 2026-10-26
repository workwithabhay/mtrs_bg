import { Business } from './business.model.js';
import type { IBusinessDocument, IBusinessSettings } from './business.types.js';
import type {
  UpdateBusinessProfileInput,
  UpdateBusinessSettingsInput,
} from './business.validation.js';
import { NotFoundError, ForbiddenError } from '../../common/errors/app-error.js';
import type { Types } from 'mongoose';

export class BusinessService {
  /**
   * Resolves and returns authorized business profile.
   * Strictly enforces tenant scoping via businessId AND ownerId.
   */
  async getBusinessProfile(
    businessId: Types.ObjectId,
    ownerId: Types.ObjectId,
  ): Promise<IBusinessDocument> {
    const business = await Business.findOne({ _id: businessId, ownerId });

    if (!business) {
      throw new NotFoundError('Business profile not found or access unauthorized.');
    }

    if (business.status === 'suspended') {
      throw new ForbiddenError('Your business account has been suspended. Please contact support.');
    }

    return business;
  }

  /**
   * Partially updates permitted business profile fields with mass-assignment protection.
   */
  async updateBusinessProfile(
    businessId: Types.ObjectId,
    ownerId: Types.ObjectId,
    input: UpdateBusinessProfileInput,
  ): Promise<IBusinessDocument> {
    const business = await this.getBusinessProfile(businessId, ownerId);

    if (input.name !== undefined) {
      business.name = input.name;
    }

    if (input.category !== undefined) {
      business.category = input.category;
    }

    if (input.googleReviewUrl !== undefined) {
      business.googleReviewUrl = input.googleReviewUrl || null;
    }

    if (input.googlePlaceId !== undefined) {
      business.googlePlaceId = input.googlePlaceId || null;
    }

    if (input.branding) {
      if (input.branding.primaryColor !== undefined) {
        business.branding.primaryColor = input.branding.primaryColor;
      }
      if (input.branding.secondaryColor !== undefined) {
        business.branding.secondaryColor = input.branding.secondaryColor;
      }
    }

    await business.save();
    return business;
  }

  /**
   * Resolves and returns authorized business settings.
   */
  async getBusinessSettings(
    businessId: Types.ObjectId,
    ownerId: Types.ObjectId,
  ): Promise<IBusinessSettings> {
    const business = await this.getBusinessProfile(businessId, ownerId);
    return business.settings;
  }

  /**
   * Partially updates permitted business settings with mass-assignment protection.
   */
  async updateBusinessSettings(
    businessId: Types.ObjectId,
    ownerId: Types.ObjectId,
    input: UpdateBusinessSettingsInput,
  ): Promise<IBusinessSettings> {
    const business = await this.getBusinessProfile(businessId, ownerId);

    if (input.defaultLanguage !== undefined) {
      business.settings.defaultLanguage = input.defaultLanguage;
    }

    if (input.allowPublicReviews !== undefined) {
      business.settings.allowPublicReviews = input.allowPublicReviews;
    }

    if (input.notificationEmail !== undefined) {
      business.settings.notificationEmail = input.notificationEmail || null;
    }

    if (input.headingText !== undefined) {
      business.settings.headingText = input.headingText || null;
    }

    if (input.subheadingText !== undefined) {
      business.settings.subheadingText = input.subheadingText || null;
    }

    if (input.feedbackQuestions !== undefined) {
      business.settings.feedbackQuestions = input.feedbackQuestions;
    }

    await business.save();
    return business.settings;
  }
}

export const businessService = new BusinessService();
