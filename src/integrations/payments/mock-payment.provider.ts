import crypto from 'node:crypto';
import type {
  PaymentProvider,
  CreateCheckoutIntentInput,
  CheckoutIntentResult,
  VerifyPaymentInput,
} from './payment.interface.js';
import { logger } from '../../common/utils/logger.js';

export class MockPaymentProvider implements PaymentProvider {
  public readonly name = 'mock';

  public async createCheckoutIntent(
    input: CreateCheckoutIntentInput,
  ): Promise<CheckoutIntentResult> {
    const isSuccess = input.simulateSuccess !== false;
    const checkoutId = `mock_chk_${crypto.randomUUID()}`;
    const paymentReference = isSuccess ? `mock_pay_${crypto.randomUUID()}` : undefined;

    logger.info(
      {
        provider: 'mock',
        isSimulated: true,
        checkoutId,
        planId: input.planId,
        interval: input.interval,
        amount: input.amount,
        currency: input.currency,
        isSuccess,
      },
      'Generated mock billing checkout intent (SIMULATION ONLY - NO REAL MONEY CHARGED)',
    );

    return {
      checkoutId,
      provider: 'mock',
      isSimulated: true,
      status: isSuccess ? 'succeeded' : 'failed',
      amount: input.amount,
      currency: input.currency,
      planId: input.planId,
      interval: input.interval,
      paymentReference,
      message: isSuccess
        ? 'Simulated mock checkout succeeded immediately for development and testing.'
        : 'Simulated mock checkout failed as requested by test input.',
      instructions:
        'This is a local simulated transaction. No credit card, UPI, or banking service was contacted.',
    };
  }

  public async verifyPaymentSignature(input: VerifyPaymentInput): Promise<boolean> {
    if (!input.orderId || !input.paymentId || !input.signature) {
      return false;
    }
    return input.signature.startsWith('mock_sig_');
  }

  public verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean {
    if (!signature || signature === 'invalid_signature' || !signature.startsWith('mock_sig_')) {
      return false;
    }
    return Boolean(rawBody);
  }
}

export const mockPaymentProvider = new MockPaymentProvider();
