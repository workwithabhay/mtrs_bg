import express, { type Application, type RequestHandler } from 'express';
import helmet, { type HelmetOptions } from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { corsOptions } from './config/cors.js';
import { requestIdMiddleware } from './common/middleware/request-id.js';
import { httpLogger } from './common/middleware/logging.js';
import { csrfProtection } from './common/middleware/csrf.js';
import { notFoundHandler } from './common/middleware/not-found.js';
import { errorHandler } from './common/middleware/error-handler.js';
import { rootRouter } from './routes/index.js';

// Resolve Helmet callable signature across TypeScript NodeNext and CJS/ESM interop
type HelmetFunction = (options?: Readonly<HelmetOptions>) => RequestHandler;
const helmetMiddleware = (
  typeof helmet === 'function'
    ? helmet
    : (helmet as unknown as { default: unknown }).default
) as HelmetFunction;

export function createApp(): Application {
  const app = express();

  // 1. Trust proxy if running behind reverse proxy (e.g. Nginx, Cloudflare)
  app.set('trust proxy', 1);

  // 2. Request tracing
  app.use(requestIdMiddleware);

  // 3. Security headers
  app.use(
    helmetMiddleware({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // 4. Secure CORS
  app.use(cors(corsOptions));

  // 5. Structured HTTP logging
  app.use(httpLogger);

  // 6. Cookie parsing for session and CSRF management
  app.use(cookieParser());

  // 7. Request body parsing with strict size limits and raw buffer retention for webhook signature verification
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as unknown as { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // 8. CSRF Protection for state-changing cookie requests
  app.use(csrfProtection);

  // 9. Application routes
  app.use(rootRouter);

  // 10. 404 handler
  app.use(notFoundHandler);

  // 11. Centralized error handling
  app.use(errorHandler);

  return app;
}

export const app = createApp();
export default app;

