import { env } from '../../config/env.js';
import { ServiceUnavailableError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { PaymentProvider } from './payment.interface.js';
import { mockPaymentProvider } from './mock-payment.provider.js';
import { razorpayPaymentProvider } from './razorpay-payment.provider.js';

export * from './payment.interface.js';
export { mockPaymentProvider, MockPaymentProvider } from './mock-payment.provider.js';
export { razorpayPaymentProvider, RazorpayPaymentProvider } from './razorpay-payment.provider.js';

/**
 * Returns the configured PaymentProvider based on environment variables.
 * In production, mock provider is strictly forbidden and throws a ServiceUnavailableError.
 */
export function getPaymentProvider(): PaymentProvider {
  const providerType = env.PAYMENT_PROVIDER;

  if (providerType === 'mock') {
    if (env.NODE_ENV === 'production' || !env.ENABLE_DEV_MOCK_PAYMENTS) {
      throw new ServiceUnavailableError(
        'Mock billing is strictly prohibited in production.',
        ErrorCode.BILLING_UNAVAILABLE,
      );
    }
    return mockPaymentProvider;
  }

  if (providerType === 'razorpay') {
    return razorpayPaymentProvider;
  }

  // providerType === 'disabled' or unconfigured
  throw new ServiceUnavailableError(
    'Billing and subscription processing is currently unavailable.',
    ErrorCode.BILLING_UNAVAILABLE,
  );
}
