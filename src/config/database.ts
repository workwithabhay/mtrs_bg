import mongoose, { type ConnectOptions } from 'mongoose';
import { env } from './env.js';
import { logger } from '../common/utils/logger.js';
import { sanitizeMongoUri } from '../common/utils/sanitize-uri.js';

export type DatabaseConnectionStatus =
  'connected' | 'connecting' | 'disconnecting' | 'disconnected';

const connectionStateMap: Record<number, DatabaseConnectionStatus> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

const mongooseOptions: ConnectOptions = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  autoIndex: env.NODE_ENV !== 'production',
};

let eventListenersRegistered = false;

function registerConnectionEvents(): void {
  if (eventListenersRegistered) return;

  mongoose.connection.on('connected', () => {
    logger.info(
      { uri: sanitizeMongoUri(env.MONGODB_URI) },
      'MongoDB connection established successfully',
    );
  });

  mongoose.connection.on('error', (err: Error) => {
    logger.error({ err }, 'MongoDB connection error encountered');
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB connection lost or disconnected');
  });

  mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB connection re-established');
  });

  eventListenersRegistered = true;
}

export async function connectDatabase(): Promise<typeof mongoose> {
  registerConnectionEvents();

  // If already connected, return early
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  const safeUri = sanitizeMongoUri(env.MONGODB_URI);

  try {
    logger.info({ uri: safeUri }, 'Connecting to MongoDB...');
    await mongoose.connect(env.MONGODB_URI, mongooseOptions);
    return mongoose;
  } catch (err) {
    logger.error(
      { err, uri: safeUri },
      'Failed to connect to MongoDB. Verify network, URI, and database status.',
    );
    throw err;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    logger.info('Closing MongoDB connection...');
    await mongoose.disconnect();
    logger.info('MongoDB connection closed cleanly');
  }
}

export function getDatabaseStatus(): DatabaseConnectionStatus {
  return connectionStateMap[mongoose.connection.readyState] ?? 'disconnected';
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
