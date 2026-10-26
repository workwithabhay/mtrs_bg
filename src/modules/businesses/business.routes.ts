import { Router } from 'express';
import { businessController } from './business.controller.js';
import { authenticate, requireRole } from '../../common/middleware/auth.js';

export const businessRouter = Router();

// Enforce authentication and business_owner role for all business management routes
businessRouter.use(authenticate, requireRole(['business_owner']));

// Business profile endpoints
businessRouter.get('/', (req, res, next) => businessController.getProfile(req, res, next));
businessRouter.patch('/', (req, res, next) => businessController.updateProfile(req, res, next));

// Business settings endpoints
businessRouter.get('/settings', (req, res, next) => businessController.getSettings(req, res, next));
businessRouter.patch('/settings', (req, res, next) =>
  businessController.updateSettings(req, res, next),
);
