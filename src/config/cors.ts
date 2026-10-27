import type { CorsOptions } from 'cors';
import { env } from './env.js';

const defaultOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'https://mtrs-fn.vercel.app',
];

const configuredOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

const allowedOrigins = Array.from(new Set([...defaultOrigins, ...configuredOrigins]));

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g. mobile apps, curl, server-to-server)
    if (!origin) {
      return callback(null, true);
    }

    const normalizedOrigin = origin.trim().replace(/\/$/, '');

    // Allow configured origins, wildcard, or any mtrs Vercel deployments
    if (
      allowedOrigins.includes(normalizedOrigin) ||
      allowedOrigins.includes('*') ||
      /^https:\/\/mtrs(-[a-z0-9-]+)?\.vercel\.app$/.test(normalizedOrigin)
    ) {
      return callback(null, true);
    }

    return callback(new Error(`CORS origin '${origin}' is not allowed by policy`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Request-Id',
    'X-CSRF-Token',
    'x-csrf-token',
    'Accept',
    'Origin',
  ],
  exposedHeaders: ['X-Request-Id'],
  maxAge: 86400, // 24 hours
};
