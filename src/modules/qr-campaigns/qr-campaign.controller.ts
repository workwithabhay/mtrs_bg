import type { Request, Response, NextFunction } from 'express';
import { qrCampaignService } from './qr-campaign.service.js';
import {
  createQrCampaignSchema,
  updateQrCampaignSchema,
  listQrCampaignsQuerySchema,
  exportQrQuerySchema,
} from './qr-campaign.validation.js';
import { sendSuccess } from '../../common/utils/response.js';
import { HttpStatus } from '../../common/constants/http-status.js';
import { UnauthorizedError, NotFoundError } from '../../common/errors/app-error.js';

export class QrCampaignController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user || !req.user.businessId) {
        throw new UnauthorizedError('Authentication required.');
      }

      // If sent as multipart/form-data with JSON branding string, parse it
      if (typeof req.body.branding === 'string') {
        try {
          req.body.branding = JSON.parse(req.body.branding);
        } catch {
          // Leave for zod validation
        }
      }

      const validatedInput = createQrCampaignSchema.parse(req.body);
      const campaign = await qrCampaignService.createCampaign(
        req.user.businessId,
        validatedInput,
        req.file,
      );

      sendSuccess(res, campaign, HttpStatus.CREATED);
    } catch (err) {
      next(err);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user || !req.user.businessId) {
        throw new UnauthorizedError('Authentication required.');
      }

      const query = listQrCampaignsQuerySchema.parse(req.query);
      const result = await qrCampaignService.listCampaigns(req.user.businessId, query);

      sendSuccess(res, result.campaigns, HttpStatus.OK, {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: Math.ceil(result.total / result.limit),
      });
    } catch (err) {
      next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user || !req.user.businessId) {
        throw new UnauthorizedError('Authentication required.');
      }

      const campaign = await qrCampaignService.getCampaignById(
        req.user.businessId,
        req.params.id as string,
      );

      sendSuccess(res, campaign, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user || !req.user.businessId) {
        throw new UnauthorizedError('Authentication required.');
      }

      if (typeof req.body.branding === 'string') {
        try {
          req.body.branding = JSON.parse(req.body.branding);
        } catch {
          // Leave for zod validation
        }
      }

      const validatedInput = updateQrCampaignSchema.parse(req.body);
      const updated = await qrCampaignService.updateCampaign(
        req.user.businessId,
        req.params.id as string,
        validatedInput,
        req.file,
      );

      sendSuccess(res, updated, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async deactivate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user || !req.user.businessId) {
        throw new UnauthorizedError('Authentication required.');
      }

      const deactivated = await qrCampaignService.deactivateCampaign(
        req.user.businessId,
        req.params.id as string,
      );

      sendSuccess(res, deactivated, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async export(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user || !req.user.businessId) {
        throw new UnauthorizedError('Authentication required.');
      }

      const { format } = exportQrQuerySchema.parse(req.query);
      const { buffer, contentType, filename } = await qrCampaignService.exportCampaign(
        req.user.businessId,
        req.params.id as string,
        format,
      );

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  }

  async publicScan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tokenParam = req.params.token;
      const publicToken = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;
      if (!publicToken) {
        throw new NotFoundError('Public token is required.');
      }

      const meta = {
        referrer: typeof req.headers.referer === 'string' ? req.headers.referer : undefined,
        language:
          typeof req.headers['accept-language'] === 'string'
            ? req.headers['accept-language']
            : undefined,
      };

      const result = await qrCampaignService.recordPublicScan(publicToken, meta);
      sendSuccess(res, result.campaign, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }
}

export const qrCampaignController = new QrCampaignController();
