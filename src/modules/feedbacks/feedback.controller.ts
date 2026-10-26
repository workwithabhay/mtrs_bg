import type { Request, Response, NextFunction } from 'express';
import { feedbackService } from './feedback.service.js';
import {
  listFeedbackQuerySchema,
  listCustomersQuerySchema,
  updateFeedbackStatusSchema,
  ownerAiAssistanceSchema,
} from './feedback.validation.js';
import { sendSuccess } from '../../common/utils/response.js';
import { HttpStatus } from '../../common/constants/http-status.js';
import { UnauthorizedError } from '../../common/errors/app-error.js';

export class FeedbackController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user || !req.user.businessId) {
        throw new UnauthorizedError('Authentication required.');
      }

      const query = listFeedbackQuerySchema.parse(req.query);
      const result = await feedbackService.listFeedbacks(req.user.businessId, query);

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

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user || !req.user.businessId) {
        throw new UnauthorizedError('Authentication required.');
      }

      const idParam = req.params.id;
      const feedbackId = Array.isArray(idParam) ? idParam[0] : idParam;
      const feedback = await feedbackService.getFeedbackById(
        req.user.businessId,
        feedbackId as string,
      );

      sendSuccess(res, feedback, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user || !req.user.businessId) {
        throw new UnauthorizedError('Authentication required.');
      }

      const idParam = req.params.id;
      const feedbackId = Array.isArray(idParam) ? idParam[0] : idParam;
      const { status } = updateFeedbackStatusSchema.parse(req.body);

      const updated = await feedbackService.updateFeedbackStatus(
        req.user.businessId,
        feedbackId as string,
        status,
      );

      sendSuccess(res, updated, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async requestAiAssistance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user || !req.user.businessId) {
        throw new UnauthorizedError('Authentication required.');
      }

      const validatedInput = ownerAiAssistanceSchema.parse(req.body);
      const result = await feedbackService.generateOwnerAiAssistance(
        req.user.businessId,
        validatedInput,
      );

      sendSuccess(res, result, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async listCustomers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user || !req.user.businessId) {
        throw new UnauthorizedError('Authentication required.');
      }

      const query = listCustomersQuerySchema.parse(req.query);
      const result = await feedbackService.listCustomers(req.user.businessId, query);

      sendSuccess(
        res,
        { customers: result.customers, stats: result.stats },
        HttpStatus.OK,
        {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        },
      );
    } catch (err) {
      next(err);
    }
  }
}

export const feedbackController = new FeedbackController();
