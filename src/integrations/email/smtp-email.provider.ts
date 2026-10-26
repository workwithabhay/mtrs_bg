import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { EmailProvider, SendOtpEmailParams } from './email.interface.js';
import { logger } from '../../common/utils/logger.js';
import { env } from '../../config/env.js';

export class SmtpEmailProvider implements EmailProvider {
  private transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE, // true for 465, false for other ports like 587
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS?.replace(/\s+/g, ''),
      },
    });
  }

  async sendOtpEmail(params: SendOtpEmailParams): Promise<void> {
    const isSignup = params.purpose === 'signup';
    const actionText = isSignup ? 'complete your registration' : 'log in to your account';
    const subject = isSignup
      ? 'Verify your email - Review Management SaaS'
      : 'Your Login Code - Review Management SaaS';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
          .card { max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
          .logo { font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 24px; }
          .heading { font-size: 18px; font-weight: 600; margin-bottom: 12px; color: #0f172a; }
          .desc { font-size: 14px; line-height: 1.5; color: #64748b; margin-bottom: 24px; }
          .otp-box { background: #f1f5f9; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 16px; text-align: center; margin-bottom: 24px; }
          .otp-code { font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #2563eb; font-family: monospace; }
          .footer { font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 16px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="logo">⭐ Review SaaS</div>
          <div class="heading">Verification Code</div>
          <div class="desc">Please use the verification code below to ${actionText}. This code is valid for 5 minutes.</div>
          <div class="otp-box">
            <div class="otp-code">${params.otp}</div>
          </div>
          <div class="desc" style="font-size: 12px;">If you did not request this verification code, you can safely ignore this email.</div>
          <div class="footer">© ${new Date().getFullYear()} Review SaaS. All rights reserved.</div>
        </div>
      </body>
      </html>
    `;

    const text = `Your verification code is: ${params.otp}\n\nUse this code to ${actionText}. This code expires in 5 minutes.\nIf you did not request this code, please ignore this email.`;

    try {
      await this.transporter.sendMail({
        from: env.EMAIL_FROM,
        to: params.to,
        subject,
        text,
        html,
      });

      logger.info(
        { to: params.to, purpose: params.purpose },
        `[Nodemailer SMTP] Successfully dispatched OTP email to ${params.to}`,
      );
    } catch (error) {
      logger.error(
        { err: error, to: params.to, purpose: params.purpose },
        `[Nodemailer SMTP] Failed to send OTP email to ${params.to}`,
      );
      throw error;
    }
  }
}
