import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { businessRouter } from '../modules/businesses/business.routes.js';
import { qrCampaignRouter } from '../modules/qr-campaigns/qr-campaign.routes.js';
import { publicQrRouter } from '../modules/qr-campaigns/public-qr.routes.js';
import { feedbackRouter } from '../modules/feedbacks/feedback.routes.js';
import { dashboardRouter } from '../modules/dashboard/dashboard.routes.js';
import { billingRouter } from '../modules/billing/billing.routes.js';
import { adminRouter } from '../modules/admin/admin.routes.js';
import { storageRouter } from './storage.routes.js';
import { qrRedirectRouter } from './qr-redirect.routes.js';

export const rootRouter = Router();

// Root route for base URL status check
rootRouter.get('/', (_req, res) => {
  res.json({
    status: 'online',
    service: 'Review Management SaaS API',
    version: '0.1.0',
    endpoints: {
      health: '/api/health',
      ready: '/api/ready',
      apiV1: '/api/v1',
    },
  });
});

// Top-level direct health probe for browser access and monitors
rootRouter.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || 'development',
    },
    meta: {
      version: '0.1.0',
    },
  });
});

// Liveness & readiness probes
rootRouter.use('/api', healthRouter);

// Public QR Code Scan Redirect (Browser Navigation for Scanned Codes)
rootRouter.use('/qr', qrRedirectRouter);

// Versioned API v1 routes
rootRouter.use('/api/v1/auth', authRouter);
rootRouter.use('/api/v1/business', businessRouter);
rootRouter.use('/api/v1/qr-campaigns', qrCampaignRouter);
rootRouter.use('/api/v1/public/qr', publicQrRouter);
rootRouter.use('/api/v1/feedback', feedbackRouter);
rootRouter.use('/api/v1/dashboard', dashboardRouter);
rootRouter.use('/api/v1/billing', billingRouter);
rootRouter.use('/api/v1/admin', adminRouter);
rootRouter.use('/api/v1/storage', storageRouter);
