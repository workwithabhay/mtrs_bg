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
  await ensureDbConnected();
  return app(req, res);
}
