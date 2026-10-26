import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import {
  setupTestDatabase,
  clearTestDatabase,
  teardownTestDatabase,
} from '../helpers/db-helper.js';
import { app } from '../../src/app.js';
import { mockEmailProvider } from '../../src/integrations/email/mock-email.provider.js';

describe('Authentication HTTP Integration Tests', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
    mockEmailProvider.clear();
  });

  it('Full Signup, Login, CSRF, Session Cookie, and Logout Lifecycle', async () => {
    const signupEmail = 'sarah@artisanbread.com';

    // 1. Request Signup OTP
    const reqSignupRes = await request(app).post('/api/v1/auth/signup/request-otp').send({
      email: signupEmail,
      name: 'Sarah Jenkins',
      businessName: 'Artisan Sourdough Bakery',
      category: 'Bakery',
      googleReviewUrl: 'https://g.page/r/artisan-bread/review',
      consentAccepted: true,
    });

    expect(reqSignupRes.status).toBe(200);
    expect(reqSignupRes.body.success).toBe(true);
    expect(reqSignupRes.body.data.message).toContain('Verification code');

    const signupOtp = mockEmailProvider.getLatestOtpFor(signupEmail);
    expect(signupOtp).toBeDefined();

    // 2. Verify Signup OTP
    const verifySignupRes = await request(app).post('/api/v1/auth/signup/verify-otp').send({
      email: signupEmail,
      otp: signupOtp,
    });

    expect(verifySignupRes.status).toBe(201);
    expect(verifySignupRes.body.success).toBe(true);
    expect(verifySignupRes.body.data.user.email).toBe(signupEmail);
    expect(verifySignupRes.body.data.user.role).toBe('business_owner');
    expect(verifySignupRes.body.data.business.name).toBe('Artisan Sourdough Bakery');

    // Verify Set-Cookie headers
    const cookies = verifySignupRes.headers['set-cookie'] as unknown as string[];
    expect(cookies).toBeDefined();
    const sessionCookie = cookies.find((c: string) => c.startsWith('session='));
    const csrfCookie = cookies.find((c: string) => c.startsWith('csrf_token='));

    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain('HttpOnly');
    expect(csrfCookie).toBeDefined();

    // Extract raw session value and csrf value
    const sessionTokenMatch = sessionCookie?.match(/session=([^;]+)/);
    const csrfTokenMatch = csrfCookie?.match(/csrf_token=([^;]+)/);
    const sessionToken = sessionTokenMatch ? sessionTokenMatch[1] : '';
    const csrfToken = csrfTokenMatch ? csrfTokenMatch[1] : '';

    expect(sessionToken).toHaveLength(64);
    expect(csrfToken).toHaveLength(48);

    // 3. Access Protected /me endpoint without session -> Expect 401
    const unauthRes = await request(app).get('/api/v1/auth/me');
    expect(unauthRes.status).toBe(401);
    expect(unauthRes.body.error.code).toBe('UNAUTHORIZED');

    // 4. Access Protected /me endpoint with valid session cookie -> Expect 200
    const authRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', [`session=${sessionToken}`]);

    expect(authRes.status).toBe(200);
    expect(authRes.body.success).toBe(true);
    expect(authRes.body.data.user.email).toBe(signupEmail);
    expect(authRes.body.data.business.name).toBe('Artisan Sourdough Bakery');

    // 5. CSRF Protection Check: Attempting state-changing POST /logout with session cookie but missing x-csrf-token
    const failedCsrfRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', [`session=${sessionToken}`, `csrf_token=${csrfToken}`]);

    expect(failedCsrfRes.status).toBe(403);
    expect(failedCsrfRes.body.error.code).toBe('FORBIDDEN');
    expect(failedCsrfRes.body.error.message).toContain('CSRF validation failed');

    // 6. Valid Logout: Send matching X-CSRF-Token header
    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', [`session=${sessionToken}`, `csrf_token=${csrfToken}`])
      .set('x-csrf-token', csrfToken);

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);

    // 7. Verify session revocation: Subsequent call to /me with the logged-out session must fail
    const revokedRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', [`session=${sessionToken}`]);

    expect(revokedRes.status).toBe(401);
    expect(revokedRes.body.error.code).toBe('UNAUTHORIZED');
  });

  it('Login workflow with enumeration protection and logout-all', async () => {
    // 1. Signup user first
    const email = 'doctor@dentalclinic.com';
    await request(app).post('/api/v1/auth/signup/request-otp').send({
      email,
      name: 'Dr. Jane Smith',
      businessName: 'Smith Family Dental',
      category: 'Healthcare',
      consentAccepted: true,
    });
    const signupOtp = mockEmailProvider.getLatestOtpFor(email)!;
    await request(app).post('/api/v1/auth/signup/verify-otp').send({
      email,
      otp: signupOtp,
    });

    mockEmailProvider.clear();

    // 2. Request Login OTP
    const loginReq = await request(app).post('/api/v1/auth/login/request-otp').send({ email });

    expect(loginReq.status).toBe(200);
    expect(loginReq.body.data.message).toContain('If an active account is registered');

    const loginOtp = mockEmailProvider.getLatestOtpFor(email)!;
    expect(loginOtp).toHaveLength(6);

    // 3. Verify Login OTP
    const loginVerify = await request(app)
      .post('/api/v1/auth/login/verify-otp')
      .send({ email, otp: loginOtp });

    expect(loginVerify.status).toBe(200);
    const cookies = loginVerify.headers['set-cookie'] as unknown as string[];
    const sessionCookie = cookies.find((c: string) => c.startsWith('session='));
    const csrfCookie = cookies.find((c: string) => c.startsWith('csrf_token='));
    const sessionToken = sessionCookie?.match(/session=([^;]+)/)?.[1] || '';
    const csrfToken = csrfCookie?.match(/csrf_token=([^;]+)/)?.[1] || '';

    // 4. Logout-all with valid CSRF token
    const logoutAllRes = await request(app)
      .post('/api/v1/auth/logout-all')
      .set('Cookie', [`session=${sessionToken}`, `csrf_token=${csrfToken}`])
      .set('x-csrf-token', csrfToken);

    expect(logoutAllRes.status).toBe(200);
    expect(logoutAllRes.body.data.message).toContain('All active sessions have been revoked');

    // 5. Subsequent access is blocked
    const testBlocked = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', [`session=${sessionToken}`]);

    expect(testBlocked.status).toBe(401);
  });
});
