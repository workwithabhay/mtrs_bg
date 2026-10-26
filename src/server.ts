import type { Server } from 'node:http';
import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './common/utils/logger.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';

let server: Server | null = null;
let isShuttingDown = false;

async function startServer(): Promise<void> {
  // Connect to database (non-blocking for process boot so health checks remain accessible)
  connectDatabase().catch((err: Error) => {
    logger.error(
      { err: err.message },
      'Initial MongoDB connection failed. Server will continue running; /api/ready will report 503 until connection is restored.',
    );
  });

  server = app.listen(env.PORT, () => {
    logger.info(
      {
        port: env.PORT,
        env: env.NODE_ENV,
        healthUrl: `http://localhost:${env.PORT}/api/health`,
        readyUrl: `http://localhost:${env.PORT}/api/ready`,
      },
      `🚀 Review Management SaaS Backend started successfully on port ${env.PORT}`,
    );
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(`Port ${env.PORT} is already in use. Please select a different port.`);
    } else {
      logger.error({ err }, 'Server encountered an unexpected error during listen');
    }
    process.exit(1);
  });
}

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    logger.warn('Graceful shutdown is already in progress...');
    return;
  }

  isShuttingDown = true;
  logger.info({ signal }, `Received ${signal}. Initiating graceful shutdown...`);

  // Stop accepting new HTTP connections
  if (server) {
    server.close(async (err) => {
      if (err) {
        logger.error({ err }, 'Error closing HTTP server');
      } else {
        logger.info('HTTP server closed successfully.');
      }

      // Close database connection
      try {
        await disconnectDatabase();
      } catch (dbErr) {
        logger.error({ err: dbErr }, 'Error closing database connection');
      }

      process.exit(err ? 1 : 0);
    });

    // Force shutdown if cleanup takes longer than 10 seconds
    const FORCE_SHUTDOWN_TIMEOUT_MS = 10000;
    setTimeout(() => {
      logger.error('Graceful shutdown timed out after 10s. Forcing exit.');
      process.exit(1);
    }, FORCE_SHUTDOWN_TIMEOUT_MS).unref();
  } else {
    await disconnectDatabase().catch((dbErr) => {
      logger.error({ err: dbErr }, 'Error closing database connection');
    });
    process.exit(0);
  }
}

// Process lifecycle listeners
process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err: Error) => {
  logger.fatal({ err }, 'Uncaught exception detected! Process terminating.');
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.fatal({ reason }, 'Unhandled promise rejection detected! Process terminating.');
  process.exit(1);
});

void startServer();
