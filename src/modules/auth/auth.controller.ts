import type { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service.js';
import {
  signupRequestOtpSchema,
  signupVerifyOtpSchema,
  loginRequestOtpSchema,
  loginVerifyOtpSchema,
} from './auth.validation.js';
import { sendSuccess } from '../../common/utils/response.js';
import { HttpStatus } from '../../common/constants/http-status.js';
import { SESSION_COOKIE_NAME } from '../../common/middleware/auth.js';
import { setCsrfCookie } from '../../common/middleware/csrf.js';
import { env } from '../../config/env.js';
import type { CookieOptions } from 'express';

export const getSessionCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
  path: '/',
  maxAge: env.SESSION_TTL_HOURS * 60 * 60 * 1000,
});

export class AuthController {
  async signupRequestOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedInput = signupRequestOtpSchema.parse(req.body);
      const result = await authService.requestSignupOtp(validatedInput);

      sendSuccess(res, result, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async signupVerifyOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedInput = signupVerifyOtpSchema.parse(req.body);
      const sessionMeta = {
        userAgent: req.headers['user-agent'] || undefined,
        ipAddress: req.ip || undefined,
      };

      const { user, business, rawSessionToken, csrfToken } = await authService.verifySignupOtp(
        validatedInput,
        sessionMeta,
      );

      const cookieOpts = getSessionCookieOptions();

      // Set HTTP-only session cookie
      res.cookie(SESSION_COOKIE_NAME, rawSessionToken, cookieOpts);

      // Set readable CSRF token cookie
      setCsrfCookie(res, csrfToken);

      sendSuccess(
        res,
        {
          user,
          business,
          token: rawSessionToken,
        },
        HttpStatus.CREATED,
      );
    } catch (err) {
      next(err);
    }
  }

  async loginRequestOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedInput = loginRequestOtpSchema.parse(req.body);
      const result = await authService.requestLoginOtp(validatedInput);

      sendSuccess(res, result, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async loginVerifyOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedInput = loginVerifyOtpSchema.parse(req.body);
      const sessionMeta = {
        userAgent: req.headers['user-agent'] || undefined,
        ipAddress: req.ip || undefined,
      };

      const { user, business, rawSessionToken, csrfToken } = await authService.verifyLoginOtp(
        validatedInput,
        sessionMeta,
      );

      const cookieOpts = getSessionCookieOptions();
      res.cookie(SESSION_COOKIE_NAME, rawSessionToken, cookieOpts);
      setCsrfCookie(res, csrfToken);

      sendSuccess(
        res,
        {
          user,
          business,
          token: rawSessionToken,
        },
        HttpStatus.OK,
      );
    } catch (err) {
      next(err);
    }
  }

  async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next();
      }

      const { user, business } = await authService.getCurrentUserProfile(req.user._id);

      sendSuccess(
        res,
        {
          user,
          business,
        },
        HttpStatus.OK,
      );
    } catch (err) {
      next(err);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.session) {
        await authService.logout(req.session);
      }

      const cookieOpts = getSessionCookieOptions();
      res.clearCookie(SESSION_COOKIE_NAME, cookieOpts);
      res.clearCookie('csrf_token', {
        path: '/',
        secure: env.NODE_ENV === 'production',
        sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
      });

      sendSuccess(res, { message: 'Successfully logged out.' }, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  }

  async logoutAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.user) {
        await authService.logoutAll(req.user._id);
      }

      const cookieOpts = getSessionCookieOptions();
      res.clearCookie(SESSION_COOKIE_NAME, cookieOpts);
      res.clearCookie('csrf_token', {
        path: '/',
        secure: env.NODE_ENV === 'production',
        sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
      });

      sendSuccess(
        res,
        { message: 'All active sessions have been revoked successfully.' },
        HttpStatus.OK,
      );
    } catch (err) {
      next(err);
    }
  }
}

export const authController = new AuthController();
