import { Router } from 'express';
import { qrCampaignController } from './qr-campaign.controller.js';
import { authenticate, requireRole } from '../../common/middleware/auth.js';
import { uploadLogoMiddleware } from '../../common/middleware/upload.js';
import { requireActiveSubscription } from '../../common/middleware/require-active-subscription.js';

export const qrCampaignRouter = Router();

// All campaign management and export routes require authentication and business_owner role
qrCampaignRouter.use(authenticate, requireRole(['business_owner']));

// QR Campaign CRUD and Actions
qrCampaignRouter.post('/', requireActiveSubscription, uploadLogoMiddleware, (req, res, next) =>
  qrCampaignController.create(req, res, next),
);

qrCampaignRouter.get('/', (req, res, next) => qrCampaignController.list(req, res, next));

qrCampaignRouter.get('/:id', (req, res, next) => qrCampaignController.getById(req, res, next));

qrCampaignRouter.patch('/:id', requireActiveSubscription, uploadLogoMiddleware, (req, res, next) =>
  qrCampaignController.update(req, res, next),
);

qrCampaignRouter.post('/:id/deactivate', (req, res, next) =>
  qrCampaignController.deactivate(req, res, next),
);

qrCampaignRouter.get('/:id/export', requireActiveSubscription, (req, res, next) =>
  qrCampaignController.export(req, res, next),
);
