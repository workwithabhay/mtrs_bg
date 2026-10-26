import type { Request, Response, NextFunction } from 'express';
import { dashboardService } from './dashboard.service.js';
import { dashboardFilterSchema, recentFeedbackQuerySchema } from './dashboard.validation.js';
import { sendSuccess } from '../../common/utils/response.js';
import { HttpStatus } from '../../common/constants/http-status.js';
import { ForbiddenError } from '../../common/errors/app-error.js';

export class DashboardController {
  async getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.businessId;
      if (!businessId) {
        throw new ForbiddenError('User is not associated with an active business.');
      }

      const query = dashboardFilterSchema.parse(req.query);
      const summary = await dashboardService.getSummary(businessId, query.range);

      sendSuccess(res, summary, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async getFeedbackTrends(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.businessId;
      if (!businessId) {
        throw new ForbiddenError('User is not associated with an active business.');
      }

      const query = dashboardFilterSchema.parse(req.query);
      const trends = await dashboardService.getFeedbackTrends(businessId, query.range);

      sendSuccess(res, trends, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async getRatingsBreakdown(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.businessId;
      if (!businessId) {
        throw new ForbiddenError('User is not associated with an active business.');
      }

      const query = dashboardFilterSchema.parse(req.query);
      const breakdown = await dashboardService.getRatingsBreakdown(businessId, query.range);

      sendSuccess(res, breakdown, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async getQrPerformance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.businessId;
      if (!businessId) {
        throw new ForbiddenError('User is not associated with an active business.');
      }

      const query = dashboardFilterSchema.parse(req.query);
      const performance = await dashboardService.getQrPerformance(businessId, query.range);

      sendSuccess(res, performance, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async getRecentFeedback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.businessId;
      if (!businessId) {
        throw new ForbiddenError('User is not associated with an active business.');
      }

      const query = recentFeedbackQuerySchema.parse(req.query);
      const result = await dashboardService.getRecentFeedback(businessId, query);

      sendSuccess(res, result.feedbacks, HttpStatus.OK, {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const dashboardController = new DashboardController();
