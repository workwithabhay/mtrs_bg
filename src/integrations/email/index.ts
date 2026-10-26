import type { EmailProvider } from './email.interface.js';
import { mockEmailProvider } from './mock-email.provider.js';
import { SmtpEmailProvider } from './smtp-email.provider.js';
import { env } from '../../config/env.js';

let activeProvider: EmailProvider | null = null;

/**
 * Returns the active email provider based on environment configuration.
 * When EMAIL_PROVIDER='smtp', uses Nodemailer with SMTP credentials.
 * Defaults to MockEmailProvider for local development and testing.
 */
export function getEmailProvider(): EmailProvider {
  // In automated test runs, always enforce the mock provider to prevent real network calls
  if (env.NODE_ENV === 'test') {
    return mockEmailProvider;
  }

  if (activeProvider) {
    return activeProvider;
  }

  if (env.EMAIL_PROVIDER === 'smtp') {
    activeProvider = new SmtpEmailProvider();
    return activeProvider;
  }

  activeProvider = mockEmailProvider;
  return activeProvider;
}

export * from './email.interface.js';
export { mockEmailProvider } from './mock-email.provider.js';
export { SmtpEmailProvider } from './smtp-email.provider.js';
