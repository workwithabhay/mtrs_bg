import { Router, type Request, type Response } from 'express';
import { sendSuccess, sendError } from '../common/utils/response.js';
import { env } from '../config/env.js';
import { getDatabaseStatus, isDatabaseConnected } from '../config/database.js';
import { HttpStatus } from '../common/constants/http-status.js';
import { ErrorCode } from '../common/errors/error-codes.js';

export const healthRouter = Router();

// Liveness probe: checks whether the process is alive and responding
healthRouter.get('/health', (_req: Request, res: Response) => {
  const healthData = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: env.NODE_ENV,
  };

  sendSuccess(res, healthData, HttpStatus.OK, {
    version: '0.1.1',
  });
});

// Readiness probe: checks whether critical dependencies (like MongoDB) are ready for traffic
healthRouter.get('/ready', (_req: Request, res: Response) => {
  const dbStatus = getDatabaseStatus();
  const dbReady = isDatabaseConnected();

  const readinessData = {
    status: dbReady ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    checks: {
      server: 'ok',
      database: dbStatus,
    },
  };

  if (!dbReady) {
    return sendError(
      res,
      ErrorCode.SERVICE_UNAVAILABLE,
      'Service is not ready to accept traffic. Database is not connected.',
      HttpStatus.SERVICE_UNAVAILABLE,
      [
        {
          field: 'database',
          message: `Database connection status is '${dbStatus}'`,
        },
      ],
    );
  }

  return sendSuccess(res, readinessData, HttpStatus.OK);
});
