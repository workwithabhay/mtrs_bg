import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { resolveFrontendBaseUrl } from '../../src/routes/qr-redirect.routes.js';

describe('QR Public Scan Redirection (GET /qr/:token)', () => {
  it('should redirect customer browser (302) to frontend customer feedback page', async () => {
    const token = 'faeff88883d7a05e7ee3a8fc';
    const res = await request(app).get(`/qr/${token}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`https://mtrs-fn.vercel.app/qr/${token}`);
  });

  it('should preserve query parameters during redirection', async () => {
    const token = 'table1-qr-campaign';
    const res = await request(app).get(`/qr/${token}?source=camera&ref=front_table`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`https://mtrs-fn.vercel.app/qr/${token}?source=camera&ref=front_table`);
  });

  it('should return 404 for invalid token characters (e.g. path traversal attempts)', async () => {
    const res = await request(app).get('/qr/invalid token with spaces');
    expect(res.status).toBe(404);
  });

  it('resolveFrontendBaseUrl should safely fallback to first CORS origin if PUBLIC_APP_URL equals backend host', () => {
    const original = env.PUBLIC_APP_URL;
    try {
      (env as unknown as { PUBLIC_APP_URL: string }).PUBLIC_APP_URL = env.APP_BASE_URL;
      const baseUrl = resolveFrontendBaseUrl();
      expect(baseUrl).toBe('http://localhost:3000');
    } finally {
      (env as unknown as { PUBLIC_APP_URL: string }).PUBLIC_APP_URL = original;
    }
  });
});
