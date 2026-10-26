import { Router } from 'express';
import { billingController } from './billing.controller.js';
import { authenticate, requireRole } from '../../common/middleware/auth.js';
import { billingLimiter } from '../../common/middleware/rate-limiter.js';

export const billingRouter = Router();

// 1. List available public plans (Public access, bounded by rate limiter)
billingRouter.get('/plans', billingLimiter, (req, res, next) =>
  billingController.listPlans(req, res, next),
);

// 2. Razorpay webhook endpoint (Public, HMAC signature verified, idempotent)
billingRouter.post('/webhook', billingLimiter, (req, res, next) =>
  billingController.handleWebhook(req, res, next),
);

// All subsequent billing endpoints require authentication and business_owner role
billingRouter.use(authenticate, requireRole(['business_owner']), billingLimiter);

// 3. Get current subscription and entitlement status
billingRouter.get('/subscription', (req, res, next) =>
  billingController.getSubscription(req, res, next),
);

// 4. Initiate payment checkout order (Razorpay or Mock)
billingRouter.post('/subscription/checkout', (req, res, next) =>
  billingController.createCheckout(req, res, next),
);

// 5. Verify Razorpay checkout payment signature
billingRouter.post('/verify-payment', (req, res, next) =>
  billingController.verifyPayment(req, res, next),
);

// 6. Redeem promotional code (e.g. FREE4YOU for lifetime-free access)
billingRouter.post('/redeem-promo', (req, res, next) =>
  billingController.redeemPromo(req, res, next),
);

// 7. Request subscription cancellation
billingRouter.post('/subscription/cancel', (req, res, next) =>
  billingController.cancelSubscription(req, res, next),
);

// 8. List paginated payment history
billingRouter.get('/payment-history', (req, res, next) =>
  billingController.getPaymentHistory(req, res, next),
);

