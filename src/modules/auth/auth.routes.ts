import { Router } from 'express';
import { authController } from './auth.controller.js';
import { authenticate } from '../../common/middleware/auth.js';
import { otpRequestLimiter, otpVerifyLimiter } from '../../common/middleware/rate-limiter.js';

export const authRouter = Router();

// Public registration endpoints
authRouter.post('/signup/request-otp', otpRequestLimiter, (req, res, next) =>
  authController.signupRequestOtp(req, res, next),
);

authRouter.post('/signup/verify-otp', otpVerifyLimiter, (req, res, next) =>
  authController.signupVerifyOtp(req, res, next),
);

// Public login endpoints
authRouter.post('/login/request-otp', otpRequestLimiter, (req, res, next) =>
  authController.loginRequestOtp(req, res, next),
);

authRouter.post('/login/verify-otp', otpVerifyLimiter, (req, res, next) =>
  authController.loginVerifyOtp(req, res, next),
);

// Authenticated session endpoints
authRouter.get('/me', authenticate, (req, res, next) => authController.getMe(req, res, next));

authRouter.post('/logout', authenticate, (req, res, next) => authController.logout(req, res, next));

authRouter.post('/logout-all', authenticate, (req, res, next) =>
  authController.logoutAll(req, res, next),
);
