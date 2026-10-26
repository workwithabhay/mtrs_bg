import type { EmailProvider, SendOtpEmailParams } from './email.interface.js';
import { logger } from '../../common/utils/logger.js';
import { env } from '../../config/env.js';

interface SentEmailRecord extends SendOtpEmailParams {
  sentAt: Date;
}

export class MockEmailProvider implements EmailProvider {
  private sentEmails: SentEmailRecord[] = [];

  async sendOtpEmail(params: SendOtpEmailParams): Promise<void> {
    const record: SentEmailRecord = {
      ...params,
      sentAt: new Date(),
    };

    this.sentEmails.push(record);

    // In development, log the simulated delivery.
    // The OTP value itself is never logged unless explicit dev test exposure is configured.
    const isDevInspectionAllowed = env.NODE_ENV !== 'production' && env.ENABLE_DEV_OTP_EXPOSURE;

    logger.info(
      {
        to: params.to,
        purpose: params.purpose,
        ...(isDevInspectionAllowed ? { devOtp: params.otp } : {}),
      },
      `[Simulated Email Provider] OTP verification email sent to ${params.to}`,
    );
  }

  /**
   * Helper for automated tests and development testing only.
   */
  getLatestOtpFor(email: string): string | undefined {
    const normalized = email.trim().toLowerCase();
    const matching = this.sentEmails
      .filter((e) => e.to.trim().toLowerCase() === normalized)
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());

    return matching[0]?.otp;
  }

  clear(): void {
    this.sentEmails = [];
  }
}

export const mockEmailProvider = new MockEmailProvider();
