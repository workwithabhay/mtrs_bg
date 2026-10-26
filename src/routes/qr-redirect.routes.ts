import { Router, type Request, type Response, type NextFunction } from 'express';
import { env } from '../config/env.js';
import { publicScanLimiter } from '../common/middleware/rate-limiter.js';
import { NotFoundError } from '../common/errors/app-error.js';

export const qrRedirectRouter = Router();

/**
 * Resolves the destination frontend base URL.
 * Protects against infinite loops if PUBLIC_APP_URL points back to the backend.
 */
export function resolveFrontendBaseUrl(): string {
  let frontendBase = env.PUBLIC_APP_URL.trim();

  try {
    const parsedPublic = new URL(frontendBase);
    const parsedBackend = new URL(env.APP_BASE_URL);

    // If PUBLIC_APP_URL points to the backend host/port, fall back to the first CORS origin
    if (parsedPublic.host === parsedBackend.host) {
      const firstAllowedOrigin = env.CORS_ORIGIN.split(',')[0]?.trim();
      if (firstAllowedOrigin) {
        frontendBase = firstAllowedOrigin;
      }
    }
  } catch {
    // Keep frontendBase as is if URL parsing fails
  }

  return frontendBase.replace(/\/+$/, '');
}

/**
 * GET /qr/:token
 * Public customer QR scan handler.
 * When a customer scans a printed or digital QR code pointing to the backend domain,
 * this endpoint validates the token and redirects their browser (302) to the frontend landing page.
 */
qrRedirectRouter.get('/:token', publicScanLimiter, (req: Request, res: Response, next: NextFunction) => {
  try {
    const tokenParam = req.params.token;
    const cleanToken = (Array.isArray(tokenParam) ? tokenParam[0] : tokenParam)?.trim();

    // Verify token format (alphanumeric hex or slug characters)
    if (!cleanToken || !/^[a-zA-Z0-9_-]+$/.test(cleanToken)) {
      throw new NotFoundError('Invalid or missing QR campaign token.');
    }

    const frontendBase = resolveFrontendBaseUrl();

    // Preserve any query parameters passed in the request (e.g., utm_source, ref)
    const queryIndex = req.originalUrl.indexOf('?');
    const queryString = queryIndex !== -1 ? req.originalUrl.substring(queryIndex) : '';

    const destinationUrl = `${frontendBase}/qr/${encodeURIComponent(cleanToken)}${queryString}`;

    return res.redirect(302, destinationUrl);
  } catch (err) {
    next(err);
  }
});
