import { User } from '../users/user.model.js';
import { Business } from '../businesses/business.model.js';
import { Subscription } from '../billing/models/subscription.model.js';
import { billingService } from '../billing/billing.service.js';
import { OtpChallenge } from './models/otp-challenge.model.js';
import { Session, type ISessionDocument } from './models/session.model.js';
import { getEmailProvider } from '../../integrations/email/index.js';
import {
  generateNumericOtp,
  hashOtp,
  verifyOtpHash,
  generateSessionToken,
  hashSessionToken,
  generateCsrfToken,
} from '../../common/utils/crypto.js';
import {
  ConflictError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  EmailDeliveryError,
} from '../../common/errors/app-error.js';
import { logger } from '../../common/utils/logger.js';
import { env } from '../../config/env.js';
import type {
  SignupRequestOtpInput,
  SignupVerifyOtpInput,
  LoginRequestOtpInput,
  LoginVerifyOtpInput,
} from './auth.validation.js';
import type { IUserDocument } from '../users/user.types.js';
import type { IBusinessDocument } from '../businesses/business.types.js';
import type { Types } from 'mongoose';

export class AuthService {
  private emailProvider = getEmailProvider();

  /**
   * Initiates business owner signup by issuing a verified OTP challenge.
   */
  async requestSignupOtp(
    input: SignupRequestOtpInput,
  ): Promise<{ message: string; cooldownSeconds: number }> {
    const normalizedEmail = input.email.trim().toLowerCase();

    // Check if an account already exists with this verified email
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser && existingUser.isEmailVerified) {
      throw new ConflictError(
        'An account with this email address already exists. Please log in instead.',
      );
    }

    // Check resend cooldown
    const latestChallenge = await OtpChallenge.findOne({
      email: normalizedEmail,
      purpose: 'signup',
    }).sort({ createdAt: -1 });

    if (latestChallenge) {
      const elapsedSeconds = Math.floor((Date.now() - latestChallenge.createdAt.getTime()) / 1000);
      if (elapsedSeconds < env.OTP_RESEND_COOLDOWN_SECONDS) {
        const remaining = env.OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds;
        throw new ValidationError(
          `Please wait ${remaining} seconds before requesting another verification code.`,
        );
      }
    }

    // Invalidate any previous unconsumed signup challenges for this email
    await OtpChallenge.updateMany(
      { email: normalizedEmail, purpose: 'signup', isConsumed: false },
      { isConsumed: true },
    );

    const otp = generateNumericOtp();
    const otpHash = hashOtp(normalizedEmail, 'signup', otp);
    const expiresAt = new Date(Date.now() + env.OTP_TTL_MINUTES * 60 * 1000);

    await OtpChallenge.create({
      email: normalizedEmail,
      purpose: 'signup',
      otpHash,
      expiresAt,
      maxAttempts: env.OTP_MAX_ATTEMPTS,
      metadata: {
        name: input.name,
        businessName: input.businessName,
        category: input.category,
        googleReviewUrl: input.googleReviewUrl || undefined,
      },
    });

    try {
      await this.emailProvider.sendOtpEmail({
        to: normalizedEmail,
        otp,
        purpose: 'signup',
      });
    } catch (err) {
      logger.error({ err, email: normalizedEmail }, 'Failed to dispatch signup OTP email');
      throw new EmailDeliveryError(
        'Failed to deliver verification email. Please verify your email configuration or try again shortly.',
      );
    }

    return {
      message: 'Verification code has been sent to your email address.',
      cooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
    };
  }

  /**
   * Verifies signup OTP, atomically creates user and business, and issues a session.
   */
  async verifySignupOtp(
    input: SignupVerifyOtpInput,
    sessionMeta: { userAgent?: string; ipAddress?: string },
  ): Promise<{
    user: IUserDocument;
    business: IBusinessDocument;
    rawSessionToken: string;
    csrfToken: string;
  }> {
    const normalizedEmail = input.email.trim().toLowerCase();

    const challenge = await OtpChallenge.findOne({
      email: normalizedEmail,
      purpose: 'signup',
      isConsumed: false,
    }).sort({ createdAt: -1 });

    if (!challenge) {
      throw new ValidationError('Invalid or expired verification code. Please request a new code.');
    }

    // Check expiration in application logic
    if (challenge.expiresAt.getTime() <= Date.now()) {
      challenge.isConsumed = true;
      await challenge.save();
      throw new ValidationError('Verification code has expired. Please request a new code.');
    }

    // Check maximum attempts
    if (challenge.attempts >= challenge.maxAttempts) {
      challenge.isConsumed = true;
      await challenge.save();
      throw new ValidationError(
        'Maximum verification attempts exceeded. Please request a new code.',
      );
    }

    // Verify OTP hash with timing-safe comparison
    const isValid = verifyOtpHash(normalizedEmail, 'signup', input.otp, challenge.otpHash);
    if (!isValid) {
      challenge.attempts += 1;
      await challenge.save();
      const remainingAttempts = challenge.maxAttempts - challenge.attempts;
      throw new ValidationError(
        `Invalid verification code. ${remainingAttempts > 0 ? `${remainingAttempts} attempt(s) remaining.` : 'Please request a new code.'}`,
      );
    }

    // Mark challenge consumed to prevent replay attacks
    challenge.isConsumed = true;
    challenge.consumedAt = new Date();
    await challenge.save();

    // Prevent duplicate user creation under concurrent verification requests
    const duplicateUser = await User.findOne({ email: normalizedEmail });
    if (duplicateUser && duplicateUser.isEmailVerified) {
      throw new ConflictError('An account with this email address already exists.');
    }

    const metadata = challenge.metadata;
    if (!metadata) {
      throw new ValidationError('Registration metadata is missing. Please restart registration.');
    }

    // Create user and business atomically with cleanup on failure
    let user: IUserDocument | null = null;
    let business: IBusinessDocument | null = null;

    try {
      user = new User({
        name: metadata.name,
        email: normalizedEmail,
        role: 'business_owner',
        status: 'active',
        isEmailVerified: true,
        lastLoginAt: new Date(),
      });
      await user.save();

      business = new Business({
        name: metadata.businessName,
        category: metadata.category,
        ownerId: user._id,
        googleReviewUrl: metadata.googleReviewUrl || null,
        status: 'active',
      });
      await business.save();

      user.businessId = business._id;
      await user.save();

      // Initialize persistent 7-day free trial for newly created account
      await billingService.initializeTrial(business._id, user._id);
    } catch (err) {
      // Rollback on partial failure
      if (business && business._id) {
        await Subscription.deleteOne({ businessId: business._id });
        await Business.findByIdAndDelete(business._id);
      }
      if (user && user._id) {
        await User.findByIdAndDelete(user._id);
      }
      throw err;
    }

    // Create authenticated session
    const rawSessionToken = generateSessionToken();
    const tokenHash = hashSessionToken(rawSessionToken);
    const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000);

    await Session.create({
      userId: user._id,
      tokenHash,
      expiresAt,
      userAgent: sessionMeta.userAgent,
      ipAddress: sessionMeta.ipAddress,
    });

    const csrfToken = generateCsrfToken();

    return {
      user,
      business,
      rawSessionToken,
      csrfToken,
    };
  }

  /**
   * Requests login OTP with account enumeration protection.
   */
  async requestLoginOtp(
    input: LoginRequestOtpInput,
  ): Promise<{ message: string; cooldownSeconds: number }> {
    const normalizedEmail = input.email.trim().toLowerCase();

    // Generic response message to avoid account enumeration
    const genericMessage =
      'If an active account is registered with this email, a verification code has been sent.';

    const user = await User.findOne({ email: normalizedEmail });

    // If user does not exist or is suspended, return generic response without issuing OTP
    if (!user || user.status === 'suspended' || !user.isEmailVerified) {
      return {
        message: genericMessage,
        cooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
      };
    }

    // Check resend cooldown
    const latestChallenge = await OtpChallenge.findOne({
      email: normalizedEmail,
      purpose: 'login',
    }).sort({ createdAt: -1 });

    if (latestChallenge) {
      const elapsedSeconds = Math.floor((Date.now() - latestChallenge.createdAt.getTime()) / 1000);
      if (elapsedSeconds < env.OTP_RESEND_COOLDOWN_SECONDS) {
        const remaining = env.OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds;
        throw new ValidationError(
          `Please wait ${remaining} seconds before requesting another login code.`,
        );
      }
    }

    // Invalidate previous unconsumed login challenges
    await OtpChallenge.updateMany(
      { email: normalizedEmail, purpose: 'login', isConsumed: false },
      { isConsumed: true },
    );

    const otp = generateNumericOtp();
    const otpHash = hashOtp(normalizedEmail, 'login', otp);
    const expiresAt = new Date(Date.now() + env.OTP_TTL_MINUTES * 60 * 1000);

    await OtpChallenge.create({
      email: normalizedEmail,
      purpose: 'login',
      otpHash,
      expiresAt,
      maxAttempts: env.OTP_MAX_ATTEMPTS,
    });

    try {
      await this.emailProvider.sendOtpEmail({
        to: normalizedEmail,
        otp,
        purpose: 'login',
      });
    } catch (err) {
      logger.error({ err, email: normalizedEmail }, 'Failed to dispatch login OTP email');
      throw new EmailDeliveryError(
        'Failed to deliver verification email. Please verify your email configuration or try again shortly.',
      );
    }

    return {
      message: genericMessage,
      cooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
    };
  }

  /**
   * Verifies login OTP and creates a session for eligible active accounts.
   */
  async verifyLoginOtp(
    input: LoginVerifyOtpInput,
    sessionMeta: { userAgent?: string; ipAddress?: string },
  ): Promise<{
    user: IUserDocument;
    business: IBusinessDocument | null;
    rawSessionToken: string;
    csrfToken: string;
  }> {
    const normalizedEmail = input.email.trim().toLowerCase();

    const challenge = await OtpChallenge.findOne({
      email: normalizedEmail,
      purpose: 'login',
      isConsumed: false,
    }).sort({ createdAt: -1 });

    if (!challenge) {
      throw new ValidationError('Invalid or expired verification code.');
    }

    if (challenge.expiresAt.getTime() <= Date.now()) {
      challenge.isConsumed = true;
      await challenge.save();
      throw new ValidationError('Verification code has expired. Please request a new code.');
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      challenge.isConsumed = true;
      await challenge.save();
      throw new ValidationError(
        'Maximum verification attempts exceeded. Please request a new code.',
      );
    }

    const isValid = verifyOtpHash(normalizedEmail, 'login', input.otp, challenge.otpHash);
    if (!isValid) {
      challenge.attempts += 1;
      await challenge.save();
      const remainingAttempts = challenge.maxAttempts - challenge.attempts;
      throw new ValidationError(
        `Invalid verification code. ${remainingAttempts > 0 ? `${remainingAttempts} attempt(s) remaining.` : 'Please request a new code.'}`,
      );
    }

    challenge.isConsumed = true;
    challenge.consumedAt = new Date();
    await challenge.save();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      throw new UnauthorizedError('Account not found.');
    }

    if (user.status === 'suspended') {
      throw new ForbiddenError('Your account has been suspended. Please contact support.');
    }

    if (user.status !== 'active' || !user.isEmailVerified) {
      throw new UnauthorizedError('Your account is not active.');
    }

    user.lastLoginAt = new Date();
    await user.save();

    const business = user.businessId ? await Business.findById(user.businessId) : null;

    // Issue session
    const rawSessionToken = generateSessionToken();
    const tokenHash = hashSessionToken(rawSessionToken);
    const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000);

    await Session.create({
      userId: user._id,
      tokenHash,
      expiresAt,
      userAgent: sessionMeta.userAgent,
      ipAddress: sessionMeta.ipAddress,
    });

    const csrfToken = generateCsrfToken();

    return {
      user,
      business,
      rawSessionToken,
      csrfToken,
    };
  }

  /**
   * Logs out the current session.
   */
  async logout(session: ISessionDocument): Promise<void> {
    session.isRevoked = true;
    session.revokedAt = new Date();
    await session.save();
  }

  /**
   * Revokes all active sessions for a user.
   */
  async logoutAll(userId: Types.ObjectId): Promise<void> {
    await Session.updateMany(
      { userId, isRevoked: false },
      { isRevoked: true, revokedAt: new Date() },
    );
  }

  /**
   * Retrieves profile details for the authenticated user.
   */
  async getCurrentUserProfile(
    userId: Types.ObjectId,
  ): Promise<{ user: IUserDocument; business: IBusinessDocument | null }> {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found.');
    }

    const business = user.businessId ? await Business.findById(user.businessId) : null;
    return { user, business };
  }
}

export const authService = new AuthService();
