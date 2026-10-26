import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error.js';
import { ErrorCode } from '../errors/error-codes.js';
import { HttpStatus } from '../constants/http-status.js';
import { sendError } from '../utils/response.js';
import { logger } from '../utils/logger.js';
import { env } from '../../config/env.js';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  // If response has already started sending headers, delegate to default Express handler
  if (res.headersSent) {
    return _next(err);
  }

  // Handle known AppError (operational errors)
  if (err instanceof AppError) {
    if (!err.isOperational) {
      logger.error(
        { err, requestId: req.id, url: req.originalUrl, method: req.method },
        'Non-operational AppError encountered',
      );
    }

    sendError(res, err.errorCode, err.message, err.statusCode, err.details);
    return;
  }

  // Handle Zod schema validation errors
  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      field: issue.path.join('.') || undefined,
      message: issue.message,
      code: issue.code,
    }));

    sendError(
      res,
      ErrorCode.VALIDATION_ERROR,
      'Request validation failed',
      HttpStatus.BAD_REQUEST,
      details,
    );
    return;
  }

  // Handle malformed JSON body errors from express.json()
  if ('type' in err && (err as { type: string }).type === 'entity.parse.failed') {
    sendError(res, ErrorCode.BAD_REQUEST, 'Malformed JSON in request body', HttpStatus.BAD_REQUEST);
    return;
  }

  // Handle Multer upload errors (file size limit, unexpected fields)
  if (err.name === 'MulterError') {
    sendError(
      res,
      ErrorCode.VALIDATION_ERROR,
      err.message || 'File upload error',
      HttpStatus.BAD_REQUEST,
    );
    return;
  }

  // Handle CORS rejection error
  if (err.message && err.message.includes('CORS origin')) {
    sendError(res, ErrorCode.FORBIDDEN, err.message, HttpStatus.FORBIDDEN);
    return;
  }

  // Unexpected / unhandled errors (500)
  logger.error(
    { err, requestId: req.id, url: req.originalUrl, method: req.method },
    'Unhandled server error occurred',
  );

  const isProduction = env.NODE_ENV === 'production';
  const clientMessage = isProduction
    ? 'An unexpected error occurred. Please try again later.'
    : err.message || 'An unexpected error occurred.';

  sendError(res, ErrorCode.INTERNAL_SERVER_ERROR, clientMessage, HttpStatus.INTERNAL_SERVER_ERROR);
}
