import { HttpStatus, type HttpStatusCode } from '../constants/http-status.js';
import { ErrorCode, type ErrorCodeType } from './error-codes.js';
import type { ApiErrorDetail } from '../types/api-response.js';

export class AppError extends Error {
  public readonly statusCode: HttpStatusCode;
  public readonly errorCode: ErrorCodeType;
  public readonly isOperational: boolean;
  public readonly details?: ApiErrorDetail[];

  constructor(
    message: string,
    statusCode: HttpStatusCode = HttpStatus.INTERNAL_SERVER_ERROR,
    errorCode: ErrorCodeType = ErrorCode.INTERNAL_SERVER_ERROR,
    isOperational = true,
    details?: ApiErrorDetail[],
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = isOperational;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(
    message = 'Bad request',
    errorCode: ErrorCodeType = ErrorCode.BAD_REQUEST,
    details?: ApiErrorDetail[],
  ) {
    super(message, HttpStatus.BAD_REQUEST, errorCode, true, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: ApiErrorDetail[]) {
    super(message, HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, true, details);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Request validation failed', details?: ApiErrorDetail[]) {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR, true, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', details?: ApiErrorDetail[]) {
    super(message, HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED, true, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden', details?: ApiErrorDetail[]) {
    super(message, HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN, true, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', details?: ApiErrorDetail[]) {
    super(message, HttpStatus.CONFLICT, ErrorCode.CONFLICT, true, details);
  }
}

export class InternalServerError extends AppError {
  constructor(message = 'Internal server error', details?: ApiErrorDetail[]) {
    super(
      message,
      HttpStatus.INTERNAL_SERVER_ERROR,
      ErrorCode.INTERNAL_SERVER_ERROR,
      false,
      details,
    );
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(
    message = 'Service unavailable',
    errorCode: ErrorCodeType = ErrorCode.SERVICE_UNAVAILABLE,
    details?: ApiErrorDetail[],
  ) {
    super(message, HttpStatus.SERVICE_UNAVAILABLE, errorCode, true, details);
  }
}

export class BadGatewayError extends AppError {
  constructor(message = 'External service communication failed', details?: ApiErrorDetail[]) {
    super(message, HttpStatus.BAD_GATEWAY, ErrorCode.BAD_GATEWAY, true, details);
  }
}

export class EmailDeliveryError extends AppError {
  constructor(
    message = 'Failed to deliver email. Please check email provider configuration.',
    details?: ApiErrorDetail[],
  ) {
    super(message, HttpStatus.BAD_GATEWAY, ErrorCode.EMAIL_DELIVERY_FAILED, true, details);
  }
}

export class SubscriptionRequiredError extends AppError {
  constructor(
    message = 'Active paid subscription or trial required to perform this action.',
    errorCode: ErrorCodeType = ErrorCode.SUBSCRIPTION_REQUIRED,
    details?: ApiErrorDetail[],
  ) {
    super(message, HttpStatus.FORBIDDEN, errorCode, true, details);
  }
}

