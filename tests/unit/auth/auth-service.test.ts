import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestDatabase,
  clearTestDatabase,
  teardownTestDatabase,
} from '../../helpers/db-helper.js';
import { authService } from '../../../src/modules/auth/auth.service.js';
import { mockEmailProvider } from '../../../src/integrations/email/mock-email.provider.js';
import { User } from '../../../src/modules/users/user.model.js';
import { Business } from '../../../src/modules/businesses/business.model.js';
import { OtpChallenge } from '../../../src/modules/auth/models/otp-challenge.model.js';
import { Session } from '../../../src/modules/auth/models/session.model.js';
import { hashSessionToken } from '../../../src/common/utils/crypto.js';

describe('AuthService Business Logic Unit Tests', () => {
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

  it('requestSignupOtp should create challenge and dispatch email', async () => {
    const signupData = {
      email: 'owner@bistro.com',
      name: 'Chef Marcus',
      businessName: 'Marcus Bistro',
      category: 'Restaurant',
      consentAccepted: true,
    };

    const res = await authService.requestSignupOtp(signupData);
    expect(res.message).toContain('Verification code');

    const sentOtp = mockEmailProvider.getLatestOtpFor('owner@bistro.com');
    expect(sentOtp).toBeDefined();
    expect(sentOtp).toHaveLength(6);

    const challenge = await OtpChallenge.findOne({ email: 'owner@bistro.com', purpose: 'signup' });
    expect(challenge).toBeDefined();
    expect(challenge?.isConsumed).toBe(false);
  });

  it('requestSignupOtp should enforce resend cooldown', async () => {
    const signupData = {
      email: 'cooldown@test.com',
      name: 'Alex',
      businessName: 'Alex Auto',
      category: 'Automotive',
      consentAccepted: true,
    };

    await authService.requestSignupOtp(signupData);

    // Immediate second attempt should trigger cooldown error
    await expect(authService.requestSignupOtp(signupData)).rejects.toThrow(
      /Please wait \d+ seconds before requesting another verification code/,
    );
  });

  it('requestSignupOtp should reject if verified account already exists', async () => {
    // Seed existing verified user
    await User.create({
      name: 'Existing Owner',
      email: 'existing@owner.com',
      role: 'business_owner',
      status: 'active',
      isEmailVerified: true,
    });

    await expect(
      authService.requestSignupOtp({
        email: 'existing@owner.com',
        name: 'New Name',
        businessName: 'Another Business',
        category: 'Retail',
        consentAccepted: true,
      }),
    ).rejects.toThrow(/An account with this email address already exists/);
  });

  it('verifySignupOtp should reject incorrect OTP and enforce attempt limit', async () => {
    await authService.requestSignupOtp({
      email: 'attempts@test.com',
      name: 'Test Attempts',
      businessName: 'Attempts LLC',
      category: 'Consulting',
      consentAccepted: true,
    });

    // 1st wrong attempt
    await expect(
      authService.verifySignupOtp(
        { email: 'attempts@test.com', otp: '000000' },
        { userAgent: 'test-agent' },
      ),
    ).rejects.toThrow(/Invalid verification code/);

    // 2nd wrong attempt
    await expect(
      authService.verifySignupOtp(
        { email: 'attempts@test.com', otp: '111111' },
        { userAgent: 'test-agent' },
      ),
    ).rejects.toThrow(/Invalid verification code/);

    // 3rd wrong attempt (exhausts attempts)
    await expect(
      authService.verifySignupOtp(
        { email: 'attempts@test.com', otp: '222222' },
        { userAgent: 'test-agent' },
      ),
    ).rejects.toThrow(/Please request a new code/);

    // Subsequent attempt is blocked due to max attempts exceeded
    await expect(
      authService.verifySignupOtp(
        { email: 'attempts@test.com', otp: '333333' },
        { userAgent: 'test-agent' },
      ),
    ).rejects.toThrow(/Maximum verification attempts exceeded/);
  });

  it('verifySignupOtp should reject expired challenge', async () => {
    await authService.requestSignupOtp({
      email: 'expired@test.com',
      name: 'Expired Test',
      businessName: 'Expired Business',
      category: 'Services',
      consentAccepted: true,
    });

    const sentOtp = mockEmailProvider.getLatestOtpFor('expired@test.com')!;

    // Manually backdate the challenge expiry
    await OtpChallenge.updateOne(
      { email: 'expired@test.com' },
      { expiresAt: new Date(Date.now() - 1000) },
    );

    await expect(
      authService.verifySignupOtp(
        { email: 'expired@test.com', otp: sentOtp },
        { userAgent: 'test-agent' },
      ),
    ).rejects.toThrow(/Verification code has expired/);
  });

  it('verifySignupOtp should successfully create user, business, session, and prevent replay', async () => {
    await authService.requestSignupOtp({
      email: 'success@bistro.com',
      name: 'Success Chef',
      businessName: 'Success Bistro',
      category: 'Food',
      googleReviewUrl: 'https://g.page/r/success-bistro/review',
      consentAccepted: true,
    });

    const otp = mockEmailProvider.getLatestOtpFor('success@bistro.com')!;

    const result = await authService.verifySignupOtp(
      { email: 'success@bistro.com', otp },
      { userAgent: 'test-browser', ipAddress: '127.0.0.1' },
    );

    // Verify User
    expect(result.user).toBeDefined();
    expect(result.user.name).toBe('Success Chef');
    expect(result.user.email).toBe('success@bistro.com');
    expect(result.user.role).toBe('business_owner');
    expect(result.user.isEmailVerified).toBe(true);
    expect(result.user.status).toBe('active');

    // Verify Business
    expect(result.business).toBeDefined();
    expect(result.business.name).toBe('Success Bistro');
    expect(result.business.ownerId.toString()).toBe(result.user._id.toString());
    expect(result.user.businessId?.toString()).toBe(result.business._id.toString());

    // Verify Session
    expect(result.rawSessionToken).toHaveLength(64);
    const tokenHash = hashSessionToken(result.rawSessionToken);
    const session = await Session.findOne({ tokenHash });
    expect(session).toBeDefined();
    expect(session?.userId.toString()).toBe(result.user._id.toString());
    expect(session?.isRevoked).toBe(false);

    // Replay attack prevention: Attempting to verify the same OTP again must fail
    await expect(
      authService.verifySignupOtp(
        { email: 'success@bistro.com', otp },
        { userAgent: 'test-browser' },
      ),
    ).rejects.toThrow(/Invalid or expired verification code/);
  });

  it('requestLoginOtp should return generic response without leaking non-existence of user', async () => {
    const res = await authService.requestLoginOtp({ email: 'nonexistent@nowhere.com' });
    expect(res.message).toBe(
      'If an active account is registered with this email, a verification code has been sent.',
    );

    // No email should have been dispatched
    expect(mockEmailProvider.getLatestOtpFor('nonexistent@nowhere.com')).toBeUndefined();
  });

  it('verifyLoginOtp should verify active user and reject suspended user', async () => {
    // 1. Create active user & business
    const activeUser = await User.create({
      name: 'Active User',
      email: 'active@test.com',
      role: 'business_owner',
      status: 'active',
      isEmailVerified: true,
    });
    const business = await Business.create({
      name: 'Active Business',
      category: 'Tech',
      ownerId: activeUser._id,
      status: 'active',
    });
    activeUser.businessId = business._id;
    await activeUser.save();

    // Request login OTP
    await authService.requestLoginOtp({ email: 'active@test.com' });
    const loginOtp = mockEmailProvider.getLatestOtpFor('active@test.com')!;

    // Verify login OTP
    const loginResult = await authService.verifyLoginOtp(
      { email: 'active@test.com', otp: loginOtp },
      { userAgent: 'login-agent' },
    );
    expect(loginResult.user._id.toString()).toBe(activeUser._id.toString());
    expect(loginResult.rawSessionToken).toHaveLength(64);

    // 2. Suspended user test
    const _suspendedUser = await User.create({
      name: 'Suspended User',
      email: 'suspended@test.com',
      role: 'business_owner',
      status: 'suspended',
      isEmailVerified: true,
    });

    // Request login OTP for suspended user returns generic response without issuing OTP
    const suspendedReq = await authService.requestLoginOtp({ email: 'suspended@test.com' });
    expect(suspendedReq.message).toContain('If an active account is registered');
    expect(mockEmailProvider.getLatestOtpFor('suspended@test.com')).toBeUndefined();
  });

  it('logout and logoutAll should revoke sessions', async () => {
    const user = await User.create({
      name: 'Logout User',
      email: 'logout@test.com',
      role: 'business_owner',
      status: 'active',
      isEmailVerified: true,
    });

    // Create 2 sessions
    const s1 = await Session.create({
      userId: user._id,
      tokenHash: 'hash_s1',
      expiresAt: new Date(Date.now() + 100000),
    });
    const s2 = await Session.create({
      userId: user._id,
      tokenHash: 'hash_s2',
      expiresAt: new Date(Date.now() + 100000),
    });

    // Logout s1
    await authService.logout(s1);
    const updatedS1 = await Session.findById(s1._id);
    expect(updatedS1?.isRevoked).toBe(true);

    // s2 is still active
    const checkS2 = await Session.findById(s2._id);
    expect(checkS2?.isRevoked).toBe(false);

    // Logout all
    await authService.logoutAll(user._id);
    const updatedS2 = await Session.findById(s2._id);
    expect(updatedS2?.isRevoked).toBe(true);
  });
});
