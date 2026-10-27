import type { Request, Response, RequestHandler } from 'express';
import rateLimitDefault, {
  rateLimit as namedRateLimit,
  type Options as RateLimitOptions,
} from 'express-rate-limit';
import { env } from '../../config/env.js';
import { HttpStatus } from '../constants/http-status.js';
import { ErrorCode } from '../errors/error-codes.js';
import { sendError } from '../utils/response.js';

// Resolve express-rate-limit callable signature across TypeScript NodeNext and CJS/ESM interop
type RateLimiterFn = (options?: Partial<RateLimitOptions>) => RequestHandler;
const rateLimit: RateLimiterFn = (
  typeof namedRateLimit === 'function'
    ? namedRateLimit
    : typeof rateLimitDefault === 'function'
      ? rateLimitDefault
      : (rateLimitDefault as unknown as { default: RateLimiterFn }).default
) as RateLimiterFn;

const isTestEnv = env.NODE_ENV === 'test';

export const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 1000 : 10, // 10 OTP requests per window
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    sendError(
      res,
      ErrorCode.RATE_LIMIT_EXCEEDED,
      'Too many OTP requests. Please wait a few minutes before trying again.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  },
});

export const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 1000 : 15, // 15 verification attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    sendError(
      res,
      ErrorCode.RATE_LIMIT_EXCEEDED,
      'Too many verification attempts. Please wait before trying again.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  },
});

export const publicScanLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isTestEnv ? 1000 : 60, // 60 scan requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    sendError(
      res,
      ErrorCode.RATE_LIMIT_EXCEEDED,
      'Too many scan requests. Please wait a moment.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  },
});

export const publicFeedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 1000 : 10, // 10 feedback submissions per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    sendError(
      res,
      ErrorCode.RATE_LIMIT_EXCEEDED,
      'Too many feedback submissions. Please wait a while before submitting again.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  },
});

export const publicReviewClickLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 1000 : 30, // 30 click events per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    sendError(
      res,
      ErrorCode.RATE_LIMIT_EXCEEDED,
      'Too many review requests. Please try again shortly.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  },
});

export const publicAiAssistanceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 1000 : 15, // 15 AI assistance requests per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    sendError(
      res,
      ErrorCode.RATE_LIMIT_EXCEEDED,
      'Too many AI assistance requests. Please wait a while before requesting again.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  },
});

export const dashboardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 1000 : 120, // 120 requests per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    sendError(
      res,
      ErrorCode.RATE_LIMIT_EXCEEDED,
      'Too many dashboard requests. Please wait a moment before refreshing.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  },
});

export const billingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 1000 : 60, // 60 billing requests per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    sendError(
      res,
      ErrorCode.RATE_LIMIT_EXCEEDED,
      'Too many billing requests. Please wait a few moments before trying again.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  },
});

export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 1000 : 120, // 120 requests per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    sendError(
      res,
      ErrorCode.RATE_LIMIT_EXCEEDED,
      'Too many administrative requests. Please wait a moment before trying again.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  },
});
