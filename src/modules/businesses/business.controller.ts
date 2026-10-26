import type { Request, Response, NextFunction } from 'express';
import { businessService } from './business.service.js';
import {
  updateBusinessProfileSchema,
  updateBusinessSettingsSchema,
} from './business.validation.js';
import { sendSuccess } from '../../common/utils/response.js';
import { HttpStatus } from '../../common/constants/http-status.js';
import { UnauthorizedError, NotFoundError } from '../../common/errors/app-error.js';

export class BusinessController {
  async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required.');
      }

      if (!req.user.businessId) {
        throw new NotFoundError('No business profile is associated with this account.');
      }

      const business = await businessService.getBusinessProfile(req.user.businessId, req.user._id);

      sendSuccess(res, business, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required.');
      }

      if (!req.user.businessId) {
        throw new NotFoundError('No business profile is associated with this account.');
      }

      const validatedInput = updateBusinessProfileSchema.parse(req.body);

      const updatedBusiness = await businessService.updateBusinessProfile(
        req.user.businessId,
        req.user._id,
        validatedInput,
      );

      sendSuccess(res, updatedBusiness, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async getSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required.');
      }

      if (!req.user.businessId) {
        throw new NotFoundError('No business profile is associated with this account.');
      }

      const settings = await businessService.getBusinessSettings(req.user.businessId, req.user._id);

      sendSuccess(res, settings, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async updateSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required.');
      }

      if (!req.user.businessId) {
        throw new NotFoundError('No business profile is associated with this account.');
      }

      const validatedInput = updateBusinessSettingsSchema.parse(req.body);

      const updatedSettings = await businessService.updateBusinessSettings(
        req.user.businessId,
        req.user._id,
        validatedInput,
      );

      sendSuccess(res, updatedSettings, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }
}

export const businessController = new BusinessController();
