import { Router } from 'express';
import { adminController } from './admin.controller.js';
import { authenticate, requireRole } from '../../common/middleware/auth.js';
import { adminLimiter } from '../../common/middleware/rate-limiter.js';
import { ForbiddenError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';

export const adminRouter = Router();

// Strictly enforce authentication, super_admin role, and rate limiting on ALL admin routes
adminRouter.use(
  authenticate,
  requireRole(['super_admin']),
  (req, _res, next) => {
    const configuredAdmin = env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
    if (configuredAdmin && env.NODE_ENV !== 'test') {
      if (req.user?.email.toLowerCase() !== configuredAdmin) {
        return next(
          new ForbiddenError(
            `Access restricted: Only authorized administrator '${configuredAdmin}' is permitted.`,
          ),
        );
      }
    }
    next();
  },
  adminLimiter,
);

// 0. Admin session verification
adminRouter.get('/me', (req, res, next) => adminController.getMe(req, res, next));

// 1. Platform-wide overview & health metrics
adminRouter.get('/overview', (req, res, next) => adminController.getOverview(req, res, next));

// 2. Business management
adminRouter.get('/businesses', (req, res, next) => adminController.getBusinesses(req, res, next));
adminRouter.get('/businesses/:id', (req, res, next) =>
  adminController.getBusinessDetail(req, res, next),
);
adminRouter.patch('/businesses/:id/status', (req, res, next) =>
  adminController.updateBusinessStatus(req, res, next),
);

// 3. Platform subscriptions & entitlement overrides
adminRouter.get('/subscriptions', (req, res, next) =>
  adminController.getSubscriptions(req, res, next),
);
adminRouter.patch('/subscriptions/:id/override', (req, res, next) =>
  adminController.overrideSubscription(req, res, next),
);

// 4. Plan management
adminRouter.get('/plans', (req, res, next) => adminController.getPlans(req, res, next));
adminRouter.post('/plans', (req, res, next) => adminController.createPlan(req, res, next));
adminRouter.patch('/plans/:id', (req, res, next) => adminController.updatePlan(req, res, next));

// 5. Promotions & FREE4YOU lifecycle
adminRouter.get('/promotions', (req, res, next) => adminController.getPromotions(req, res, next));
adminRouter.post('/promotions/:code/pause', (req, res, next) =>
  adminController.pausePromotion(req, res, next),
);
adminRouter.post('/promotions/:code/resume', (req, res, next) =>
  adminController.resumePromotion(req, res, next),
);
adminRouter.post('/promotions/:code/retire', (req, res, next) =>
  adminController.retirePromotion(req, res, next),
);

// 6. Payments & transactions
adminRouter.get('/payments', (req, res, next) => adminController.getPayments(req, res, next));

// 7. Billing operations & webhooks
adminRouter.get('/operations/health', (req, res, next) =>
  adminController.getBillingOperations(req, res, next),
);
adminRouter.get('/operations/webhooks', (req, res, next) =>
  adminController.getWebhooks(req, res, next),
);

// 8. Audit logs
adminRouter.get('/audit-logs', (req, res, next) => adminController.getAuditLogs(req, res, next));

