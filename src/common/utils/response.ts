import type { Response } from 'express';
import { HttpStatus, type HttpStatusCode } from '../constants/http-status.js';
import type {
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiErrorDetail,
} from '../types/api-response.js';

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode: HttpStatusCode = HttpStatus.OK,
  meta?: Record<string, unknown>,
): Response {
  const payload: ApiSuccessResponse<T> = {
    success: true,
    data,
    ...(meta ? { meta } : {}),
  };

  return res.status(statusCode).json(payload);
}

export function sendError(
  res: Response,
  code: string,
  message: string,
  statusCode: HttpStatusCode = HttpStatus.INTERNAL_SERVER_ERROR,
  details?: ApiErrorDetail[],
): Response {
  const payload: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details && details.length > 0 ? { details } : {}),
    },
  };

  return res.status(statusCode).json(payload);
}
