import { Router } from 'express';
import { qrCampaignController } from './qr-campaign.controller.js';
import { publicFeedbackController } from '../feedbacks/public-feedback.controller.js';
import {
  publicScanLimiter,
  publicFeedbackLimiter,
  publicReviewClickLimiter,
  publicAiAssistanceLimiter,
} from '../../common/middleware/rate-limiter.js';

export const publicQrRouter = Router();

// 1. Public QR campaign landing page resolution
publicQrRouter.get('/:token', publicScanLimiter, (req, res, next) =>
  publicFeedbackController.resolvePublicLanding(req, res, next),
);

// 2. Public scan recording endpoint with rate limiting
publicQrRouter.post('/:token/scan', publicScanLimiter, (req, res, next) =>
  qrCampaignController.publicScan(req, res, next),
);

// 3. Customer feedback submission
publicQrRouter.post('/:token/feedback', publicFeedbackLimiter, (req, res, next) =>
  publicFeedbackController.submitFeedback(req, res, next),
);

// 4. Google review option click tracking
publicQrRouter.post('/:token/google-review-click', publicReviewClickLimiter, (req, res, next) =>
  publicFeedbackController.trackGoogleReviewClick(req, res, next),
);

// 5. Customer AI feedback draft assistance (Phase 7)
publicQrRouter.post('/:token/ai-assistance', publicAiAssistanceLimiter, (req, res, next) =>
  publicFeedbackController.requestAiAssistance(req, res, next),
);
