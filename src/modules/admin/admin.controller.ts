import type { Request, Response, NextFunction } from 'express';
import { adminService } from './admin.service.js';
import {
  adminBusinessQuerySchema,
  adminSubscriptionQuerySchema,
  adminAuditLogQuerySchema,
  createPlanSchema,
  updatePlanSchema,
  updateBusinessStatusSchema,
  overrideSubscriptionSchema,
  retirePromotionSchema,
  adminPaymentsQuerySchema,
  adminWebhooksQuerySchema,
} from './admin.validation.js';
import { sendSuccess } from '../../common/utils/response.js';
import { HttpStatus } from '../../common/constants/http-status.js';
import { UnauthorizedError } from '../../common/errors/app-error.js';

export class AdminController {
  private getActor(req: Request) {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required.');
    }
    return {
      id: req.user._id,
      email: req.user.email,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    };
  }

  async getOverview(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const overview = await adminService.getPlatformOverview();
      sendSuccess(res, overview, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async getBusinesses(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = adminBusinessQuerySchema.parse(req.query);
      const result = await adminService.getBusinesses(query);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async getBusinessDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const detail = await adminService.getBusinessDetail(req.params.id as string);
      sendSuccess(res, detail, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async getSubscriptions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = adminSubscriptionQuerySchema.parse(req.query);
      const result = await adminService.getSubscriptions(query);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async getPlans(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const plans = await adminService.getPlans();
      sendSuccess(res, plans, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async createPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = this.getActor(req);
      const validatedInput = createPlanSchema.parse(req.body);
      const plan = await adminService.createPlan(validatedInput, actor);
      sendSuccess(res, plan, HttpStatus.CREATED);
    } catch (err) {
      next(err);
    }
  }

  async updatePlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = this.getActor(req);
      const validatedInput = updatePlanSchema.parse(req.body);
      const plan = await adminService.updatePlan(req.params.id as string, validatedInput, actor);
      sendSuccess(res, plan, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = adminAuditLogQuerySchema.parse(req.query);
      const result = await adminService.getAuditLogs(query);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required.');
      }
      sendSuccess(
        res,
        {
          id: req.user._id,
          email: req.user.email,
          name: req.user.name,
          role: req.user.role,
        },
        HttpStatus.OK,
      );
    } catch (err) {
      next(err);
    }
  }

  async updateBusinessStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = this.getActor(req);
      const validatedInput = updateBusinessStatusSchema.parse(req.body);
      const result = await adminService.updateBusinessStatus(
        req.params.id as string,
        validatedInput,
        actor,
      );
      sendSuccess(res, result, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async overrideSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = this.getActor(req);
      const validatedInput = overrideSubscriptionSchema.parse(req.body);
      const result = await adminService.overrideSubscription(
        req.params.id as string,
        validatedInput,
        actor,
      );
      sendSuccess(res, result, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async getPromotions(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await adminService.getPromotions();
      sendSuccess(res, result, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async pausePromotion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = this.getActor(req);
      const result = await adminService.pausePromotion(req.params.code as string, actor);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async resumePromotion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = this.getActor(req);
      const result = await adminService.resumePromotion(req.params.code as string, actor);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async retirePromotion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = this.getActor(req);
      const validatedInput = retirePromotionSchema.parse(req.body);
      const result = await adminService.retirePromotion(
        req.params.code as string,
        validatedInput,
        actor,
      );
      sendSuccess(res, result, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async getPayments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = adminPaymentsQuerySchema.parse(req.query);
      const result = await adminService.getPayments(query);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async getBillingOperations(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await adminService.getBillingOperations();
      sendSuccess(res, result, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async getWebhooks(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = adminWebhooksQuerySchema.parse(req.query);
      const result = await adminService.getWebhooks(query);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }
}

export const adminController = new AdminController();
