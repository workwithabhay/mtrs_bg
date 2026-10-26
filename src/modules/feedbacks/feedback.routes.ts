import { Router } from 'express';
import { feedbackController } from './feedback.controller.js';
import { authenticate, requireRole } from '../../common/middleware/auth.js';
import { requireActiveSubscription } from '../../common/middleware/require-active-subscription.js';

export const feedbackRouter = Router();

// All internal feedback endpoints require authentication and business_owner role
feedbackRouter.use(authenticate, requireRole(['business_owner']));

feedbackRouter.get('/', (req, res, next) => feedbackController.list(req, res, next));
feedbackRouter.get('/customers', (req, res, next) =>
  feedbackController.listCustomers(req, res, next),
);
feedbackRouter.post('/ai-assistance', requireActiveSubscription, (req, res, next) =>
  feedbackController.requestAiAssistance(req, res, next),
);
feedbackRouter.get('/:id', (req, res, next) => feedbackController.getById(req, res, next));
feedbackRouter.patch('/:id/status', (req, res, next) =>
  feedbackController.updateStatus(req, res, next),
);
