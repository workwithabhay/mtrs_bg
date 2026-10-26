import { Router } from 'express';
import { dashboardController } from './dashboard.controller.js';
import { authenticate, requireRole } from '../../common/middleware/auth.js';
import { dashboardLimiter } from '../../common/middleware/rate-limiter.js';

export const dashboardRouter = Router();

// All owner dashboard routes require an active authenticated session and business_owner role
dashboardRouter.use(authenticate, requireRole(['business_owner']), dashboardLimiter);

// 1. High-level dashboard summary metrics
dashboardRouter.get('/summary', (req, res, next) => dashboardController.getSummary(req, res, next));

// 2. Feedback and engagement trends time series
dashboardRouter.get('/feedback-trends', (req, res, next) =>
  dashboardController.getFeedbackTrends(req, res, next),
);

// 3. 1-to-5 star ratings distribution breakdown
dashboardRouter.get('/ratings-breakdown', (req, res, next) =>
  dashboardController.getRatingsBreakdown(req, res, next),
);

// 4. Per-campaign QR performance metrics
dashboardRouter.get('/qr-performance', (req, res, next) =>
  dashboardController.getQrPerformance(req, res, next),
);

// 5. Paginated recent feedback previews without PII
dashboardRouter.get('/recent-feedback', (req, res, next) =>
  dashboardController.getRecentFeedback(req, res, next),
);
