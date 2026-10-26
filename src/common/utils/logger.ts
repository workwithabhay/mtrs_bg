import pino from 'pino';
import { env } from '../../config/env.js';

const isDev = env.NODE_ENV === 'development';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-csrf-token"]',
      'req.body.password',
      'req.body.otp',
      'req.body.token',
      'req.body.secret',
      '*.password',
      '*.token',
      '*.otp',
      '*.secret',
      '*.creditCard',
      '*.cvv',
      '*.phone',
      '*.email',
    ],
    remove: false,
    censor: '[REDACTED]',
  },
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});
