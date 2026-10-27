import type { Request, Response, NextFunction } from 'express';
import { HttpStatus } from '../constants/http-status.js';
import { ErrorCode } from '../errors/error-codes.js';
import { sendError } from '../utils/response.js';
import { generateCsrfToken } from '../utils/crypto.js';
import { env } from '../../config/env.js';

export const CSRF_COOKIE_NAME = 'csrf_token';
export const CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * Attaches a readable CSRF token cookie for the frontend client.
 */
export function setCsrfCookie(res: Response, token: string): void {
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // Must be accessible to JavaScript frontend so it can read and send in header
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
    maxAge: env.SESSION_TTL_HOURS * 60 * 60 * 1000,
  });
}

/**
 * CSRF Protection Middleware for cookie-authenticated state-changing requests.
 * Uses the Double-Submit Cookie defense pattern.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  const isStateChangingMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);

  // Safe HTTP methods (GET, HEAD, OPTIONS) do not require CSRF verification
  if (!isStateChangingMethod) {
    return next();
  }

  // Public unauthenticated routes (like OTP requests and verifications) do not use existing session cookies
  if (req.path.startsWith('/api/v1/auth/signup') || req.path.startsWith('/api/v1/auth/login')) {
    return next();
  }

  // Check if request is using cookie-based authentication
  const hasSessionCookie = Boolean(req.cookies?.['session']);
  if (!hasSessionCookie) {
    // If not authenticated via cookie (e.g. initial public request), CSRF is not applicable
    return next();
  }

  const cookieCsrfToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerCsrfToken = req.headers[CSRF_HEADER_NAME];

  if (
    !cookieCsrfToken ||
    !headerCsrfToken ||
    typeof headerCsrfToken !== 'string' ||
    cookieCsrfToken !== headerCsrfToken
  ) {
    sendError(
      res,
      ErrorCode.FORBIDDEN,
      'CSRF validation failed. Missing or invalid X-CSRF-Token header.',
      HttpStatus.FORBIDDEN,
    );
    return;
  }

  next();
}

export { generateCsrfToken };
