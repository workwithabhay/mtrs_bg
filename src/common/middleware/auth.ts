import type { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, ForbiddenError } from '../errors/app-error.js';
import { hashSessionToken } from '../utils/crypto.js';
import { Session } from '../../modules/auth/models/session.model.js';
import { User } from '../../modules/users/user.model.js';
import type { UserRole } from '../../modules/users/user.types.js';

export const SESSION_COOKIE_NAME = 'session';

/**
 * Extracts raw session token from cookies or fallback Authorization Bearer header.
 */
function extractToken(req: Request): string | null {
  if (req.cookies && req.cookies[SESSION_COOKIE_NAME]) {
    return req.cookies[SESSION_COOKIE_NAME];
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  return null;
}

/**
 * Authenticates requests via session token and attaches user and tenant context to Request.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawToken = extractToken(req);

    if (!rawToken) {
      throw new UnauthorizedError('Authentication required. No session token provided.');
    }

    const tokenHash = hashSessionToken(rawToken);

    // Find active session
    const session = await Session.findOne({
      tokenHash,
      isRevoked: false,
    });

    if (!session) {
      res.clearCookie(SESSION_COOKIE_NAME);
      throw new UnauthorizedError('Invalid or revoked session.');
    }

    // Verify session expiration
    if (session.expiresAt.getTime() <= Date.now()) {
      session.isRevoked = true;
      session.revokedAt = new Date();
      await session.save();
      res.clearCookie(SESSION_COOKIE_NAME);
      throw new UnauthorizedError('Session has expired. Please log in again.');
    }

    // Lookup user
    const user = await User.findById(session.userId);

    if (!user) {
      throw new UnauthorizedError('Associated user account no longer exists.');
    }

    if (user.status === 'suspended') {
      throw new ForbiddenError('Your account has been suspended. Please contact support.');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedError('Your account is not active.');
    }

    // Attach trusted server-derived identity
    req.user = user;
    req.session = session;
    if (user.businessId) {
      req.businessId = user.businessId;
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Role-based authorization middleware.
 */
export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError('You do not have permission to access this resource.'));
    }

    next();
  };
}
