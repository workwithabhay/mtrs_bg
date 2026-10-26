import type { Request, Response, NextFunction } from 'express';
import { billingService } from './billing.service.js';
import {
  checkoutSchema,
  verifyPaymentSchema,
  redeemPromoSchema,
  cancelSubscriptionSchema,
  paymentHistoryQuerySchema,
} from './billing.validation.js';
import { sendSuccess } from '../../common/utils/response.js';
import { HttpStatus } from '../../common/constants/http-status.js';
import { ForbiddenError, UnauthorizedError } from '../../common/errors/app-error.js';

export class BillingController {
  /**
   * GET /api/v1/billing/plans
   * Public endpoint to list available published plans.
   */
  async listPlans(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const plans = await billingService.listPlans();
      sendSuccess(res, plans, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/billing/subscription
   * Authenticated business owner's current subscription and entitlement status.
   */
  async getSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.businessId;
      if (!businessId) {
        throw new ForbiddenError('User is not associated with an active business.');
      }

      const subscription = await billingService.getSubscription(businessId);
      sendSuccess(res, subscription, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/billing/subscription/checkout
   * Initiates a payment checkout order with Razorpay or Mock provider.
   */
  async createCheckout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.businessId;
      const ownerId = req.user?._id;

      if (!businessId) {
        throw new ForbiddenError('User is not associated with an active business.');
      }
      if (!ownerId) {
        throw new UnauthorizedError('Authentication required.');
      }

      const validatedInput = checkoutSchema.parse(req.body);
      const checkoutResult = await billingService.createCheckout(
        businessId,
        ownerId,
        validatedInput,
      );

      sendSuccess(res, checkoutResult, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/billing/verify-payment
   * Verifies client-submitted Razorpay payment signature and activates entitlement.
   */
  async verifyPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.businessId;
      const ownerId = req.user?._id;

      if (!businessId) {
        throw new ForbiddenError('User is not associated with an active business.');
      }
      if (!ownerId) {
        throw new UnauthorizedError('Authentication required.');
      }

      const validatedInput = verifyPaymentSchema.parse(req.body);
      const result = await billingService.verifyPayment(
        businessId,
        ownerId,
        validatedInput,
      );

      sendSuccess(res, result, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/billing/redeem-promo
   * Validates and redeems FREE4YOU promotional code for lifetime-free access.
   */
  async redeemPromo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.businessId;
      const ownerId = req.user?._id;

      if (!businessId) {
        throw new ForbiddenError('User is not associated with an active business.');
      }
      if (!ownerId) {
        throw new UnauthorizedError('Authentication required.');
      }

      const validatedInput = redeemPromoSchema.parse(req.body);
      const result = await billingService.redeemPromoCode(
        businessId,
        ownerId,
        validatedInput.code,
      );

      sendSuccess(res, result, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/billing/webhook
   * Public Razorpay webhook endpoint (idempotent, signature-verified).
   */
  async handleWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const signature = (req.headers['x-razorpay-signature'] as string) || undefined;
      const rawBody =
        req.rawBody ||
        (typeof req.body === 'string'
          ? req.body
          : Buffer.from(JSON.stringify(req.body || {})));

      const result = await billingService.handleWebhook(rawBody, signature);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/billing/subscription/cancel
   * Request subscription cancellation.
   */
  async cancelSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.businessId;
      const ownerId = req.user?._id;

      if (!businessId) {
        throw new ForbiddenError('User is not associated with an active business.');
      }
      if (!ownerId) {
        throw new UnauthorizedError('Authentication required.');
      }

      const validatedInput = cancelSubscriptionSchema.parse(req.body);
      const cancelResult = await billingService.cancelSubscription(
        businessId,
        ownerId,
        validatedInput.immediate,
      );

      sendSuccess(res, cancelResult, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/billing/payment-history
   * List authenticated owner's paginated payment history.
   */
  async getPaymentHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const businessId = req.businessId;
      if (!businessId) {
        throw new ForbiddenError('User is not associated with an active business.');
      }

      const query = paymentHistoryQuerySchema.parse(req.query);
      const history = await billingService.getPaymentHistory(businessId, query);

      sendSuccess(res, history, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }
}

export const billingController = new BillingController();
