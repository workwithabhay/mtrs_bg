import type { Request, Response, NextFunction } from 'express';
import { billingService } from '../../modules/billing/billing.service.js';
import { ForbiddenError, SubscriptionRequiredError } from '../errors/app-error.js';
import { ErrorCode } from '../errors/error-codes.js';

/**
 * Middleware that verifies the authenticated business has active entitlement
 * (active 7-day trial, active paid monthly/package subscription, or active FREE4YOU lifetime promo).
 *
 * If access has expired or is restricted, it blocks mutating/paid product operations with 403 Forbidden
 * while leaving data viewing, authentication, billing checkout, and public QR scans accessible.
 */
export async function requireActiveSubscription(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const businessId = req.businessId;
    if (!businessId) {
      throw new ForbiddenError('Business context required to access this resource.');
    }

    const entitlement = await billingService.getEntitlement(businessId);

    if (!entitlement.canAccessProduct) {
      const errorCode =
        entitlement.status === 'trial_expired'
          ? ErrorCode.TRIAL_EXPIRED
          : ErrorCode.SUBSCRIPTION_REQUIRED;

      throw new SubscriptionRequiredError(
        `Action restricted: ${entitlement.reason} Please upgrade or renew your plan.`,
        errorCode,
        [
          {
            field: 'entitlementStatus',
            message: entitlement.status,
          },
        ],
      );
    }

    req.entitlement = entitlement;
    next();
  } catch (err) {
    next(err);
  }
}
