import type { Request, Response } from 'express';
import { app } from '../src/app.js';
import { connectDatabase } from '../src/config/database.js';

let isConnecting = false;

async function ensureDbConnected(): Promise<void> {
  if (isConnecting) return;
  isConnecting = true;
  try {
    await connectDatabase();
  } catch (error) {
    console.error('Failed to connect to MongoDB in serverless invocation:', error);
  } finally {
    isConnecting = false;
  }
}

export default async function handler(req: Request, res: Response) {
  try {
    const isHealthRoute =
      req.url === '/' ||
      req.url === '/health' ||
      req.url === '/api/health' ||
      req.url?.startsWith('/health') ||
      req.url?.startsWith('/api/health');

    if (!isHealthRoute) {
      await ensureDbConnected();
    } else {
      // Non-blocking connection check for health probes so probe never times out
      void ensureDbConnected().catch(() => {});
    }

    return app(req, res);
  } catch (error) {
    console.error('Unhandled error in serverless handler:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An internal error occurred during request processing.',
        },
      });
    }
  }
}
