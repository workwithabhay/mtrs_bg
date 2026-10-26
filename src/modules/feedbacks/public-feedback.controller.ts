import type { Request, Response, NextFunction } from 'express';
import { feedbackService } from './feedback.service.js';
import { submitFeedbackSchema, aiAssistanceSchema } from './feedback.validation.js';
import { sendSuccess } from '../../common/utils/response.js';
import { HttpStatus } from '../../common/constants/http-status.js';
import { NotFoundError } from '../../common/errors/app-error.js';

export class PublicFeedbackController {
  async resolvePublicLanding(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tokenParam = req.params.token;
      const publicToken = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;
      if (!publicToken) {
        throw new NotFoundError('Public token is required.');
      }

      const landingData = await feedbackService.getPublicLandingByToken(publicToken);
      sendSuccess(res, landingData, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async submitFeedback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tokenParam = req.params.token;
      const publicToken = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;
      if (!publicToken) {
        throw new NotFoundError('Public token is required.');
      }

      const validatedInput = submitFeedbackSchema.parse(req.body);
      const result = await feedbackService.submitFeedback(publicToken, validatedInput);

      sendSuccess(res, result, HttpStatus.CREATED);
    } catch (err) {
      next(err);
    }
  }

  async trackGoogleReviewClick(req: Request, res: Response, next: NextFunction): Promise<void> {
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

      const result = await feedbackService.trackGoogleReviewClick(publicToken, meta);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async requestAiAssistance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tokenParam = req.params.token;
      const publicToken = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;
      if (!publicToken) {
        throw new NotFoundError('Public token is required.');
      }

      const validatedInput = aiAssistanceSchema.parse(req.body);
      const result = await feedbackService.generateAiAssistance(publicToken, validatedInput);

      sendSuccess(res, result, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }
}

export const publicFeedbackController = new PublicFeedbackController();
