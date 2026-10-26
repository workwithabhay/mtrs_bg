import { pinoHttp } from 'pino-http';
import { logger } from '../utils/logger.js';

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => (req as unknown as { id?: string }).id || '',
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 500 || err) {
      return 'error';
    }
    if (res.statusCode >= 400) {
      return 'warn';
    }
    return 'info';
  },
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} completed with status ${res.statusCode}`;
  },
  customErrorMessage: (req, res, err) => {
    return `${req.method} ${req.url} failed with status ${res.statusCode}: ${err.message}`;
  },
  autoLogging: {
    ignore: (req) => {
      // Do not flood logs with frequent health probe polls
      return req.url === '/api/health' || req.url === '/api/ready';
    },
  },
});
