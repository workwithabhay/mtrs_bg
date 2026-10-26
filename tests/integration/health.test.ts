import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { isDatabaseConnected } from '../../src/config/database.js';

describe('Health and System Routes Smoke Tests', () => {
  it('GET /api/health should return 200 with standard health payload and X-Request-Id', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['x-request-id']).toBeDefined();

    expect(res.body).toEqual({
      success: true,
      data: {
        status: 'healthy',
        timestamp: expect.any(String),
        uptimeSeconds: expect.any(Number),
        environment: expect.any(String),
      },
      meta: {
        version: '0.1.0',
      },
    });
  });

  it('GET /api/ready should accurately reflect database connectivity state', async () => {
    const res = await request(app).get('/api/ready');
    const isDbReady = isDatabaseConnected();

    if (isDbReady) {
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        data: {
          status: 'ready',
          checks: {
            server: 'ok',
            database: 'connected',
          },
        },
      });
    } else {
      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Service is not ready to accept traffic. Database is not connected.',
          details: [
            {
              field: 'database',
              message: expect.stringContaining('Database connection status is'),
            },
          ],
        },
      });
    }
  });

  it('GET /api/unknown-endpoint should return 404 with standardized error response', async () => {
    const res = await request(app).get('/api/unknown-endpoint');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: "Endpoint 'GET /api/unknown-endpoint' not found",
      },
    });
  });
});
