import { describe, it, expect, vi, beforeEach } from 'vitest';
import nodemailer from 'nodemailer';
import { MockEmailProvider } from '../../../src/integrations/email/mock-email.provider.js';
import { SmtpEmailProvider } from '../../../src/integrations/email/smtp-email.provider.js';

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(),
  },
}));

describe('Email Providers', () => {
  describe('MockEmailProvider', () => {
    let mockProvider: MockEmailProvider;

    beforeEach(() => {
      mockProvider = new MockEmailProvider();
    });

    it('should store sent OTP and allow retrieval by email', async () => {
      await mockProvider.sendOtpEmail({
        to: 'user@example.com',
        otp: '123456',
        purpose: 'signup',
      });

      expect(mockProvider.getLatestOtpFor('user@example.com')).toBe('123456');
      expect(mockProvider.getLatestOtpFor('USER@EXAMPLE.COM')).toBe('123456'); // case-insensitive
    });

    it('should return undefined for emails with no recorded OTP', () => {
      expect(mockProvider.getLatestOtpFor('nonexistent@example.com')).toBeUndefined();
    });

    it('should clear stored emails when clear() is called', async () => {
      await mockProvider.sendOtpEmail({
        to: 'user@example.com',
        otp: '654321',
        purpose: 'login',
      });

      expect(mockProvider.getLatestOtpFor('user@example.com')).toBe('654321');
      mockProvider.clear();
      expect(mockProvider.getLatestOtpFor('user@example.com')).toBeUndefined();
    });
  });

  describe('SmtpEmailProvider', () => {
    let mockSendMail: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vi.clearAllMocks();
      mockSendMail = vi.fn().mockResolvedValue({ messageId: 'msg-123' });
      vi.mocked(nodemailer.createTransport).mockReturnValue({
        sendMail: mockSendMail,
      } as unknown as ReturnType<typeof nodemailer.createTransport>);
    });

    it('should dispatch signup OTP email with correct parameters and HTML template', async () => {
      const provider = new SmtpEmailProvider();

      await provider.sendOtpEmail({
        to: 'test@domain.com',
        otp: '849201',
        purpose: 'signup',
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.to).toBe('test@domain.com');
      expect(callArgs.subject).toContain('Verify your email');
      expect(callArgs.text).toContain('849201');
      expect(callArgs.html).toContain('849201');
      expect(callArgs.html).toContain('complete your registration');
    });

    it('should dispatch login OTP email with login subject', async () => {
      const provider = new SmtpEmailProvider();

      await provider.sendOtpEmail({
        to: 'owner@domain.com',
        otp: '112233',
        purpose: 'login',
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.to).toBe('owner@domain.com');
      expect(callArgs.subject).toContain('Your Login Code');
      expect(callArgs.text).toContain('112233');
      expect(callArgs.html).toContain('log in to your account');
    });

    it('should rethrow error and log when sendMail fails', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP connection timed out'));
      const provider = new SmtpEmailProvider();

      await expect(
        provider.sendOtpEmail({
          to: 'fail@domain.com',
          otp: '999999',
          purpose: 'login',
        }),
      ).rejects.toThrow('SMTP connection timed out');
    });
  });
});
