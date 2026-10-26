import { randomInt, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';

/**
 * Generates an unpredictable 6-digit numeric OTP using crypto.randomInt.
 */
export function generateNumericOtp(): string {
  return randomInt(100000, 1000000).toString();
}

/**
 * Computes a keyed HMAC-SHA256 hash for an OTP bound to email and purpose.
 */
export function hashOtp(email: string, purpose: string, otp: string): string {
  const normalizedEmail = email.trim().toLowerCase();
  const payload = `${normalizedEmail}:${purpose}:${otp}`;
  return createHmac('sha256', env.OTP_SECRET).update(payload).digest('hex');
}

/**
 * Timing-safe comparison to verify candidate OTP against expected HMAC hash.
 */
export function verifyOtpHash(
  email: string,
  purpose: string,
  candidateOtp: string,
  expectedHash: string,
): boolean {
  try {
    const candidateHash = hashOtp(email, purpose, candidateOtp);
    const candidateBuf = Buffer.from(candidateHash, 'hex');
    const expectedBuf = Buffer.from(expectedHash, 'hex');

    if (candidateBuf.length !== expectedBuf.length) {
      return false;
    }

    return timingSafeEqual(candidateBuf, expectedBuf);
  } catch {
    return false;
  }
}

/**
 * Generates a high-entropy 64-character cryptographic session token.
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Hashes a raw session token using HMAC-SHA256 before database storage.
 */
export function hashSessionToken(token: string): string {
  return createHmac('sha256', env.SESSION_SECRET).update(token).digest('hex');
}

/**
 * Generates an anti-CSRF token for cookie-based state-changing verification.
 */
export function generateCsrfToken(): string {
  return randomBytes(24).toString('hex');
}
