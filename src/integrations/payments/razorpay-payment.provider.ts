import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { env } from '../../config/env.js';
import { logger } from '../../common/utils/logger.js';
import { ServiceUnavailableError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type {
  PaymentProvider,
  CreateCheckoutIntentInput,
  CheckoutIntentResult,
  VerifyPaymentInput,
} from './payment.interface.js';

export interface RazorpayOptions {
  keyId?: string;
  keySecret?: string;
  webhookSecret?: string;
}

export class RazorpayPaymentProvider implements PaymentProvider {
  public readonly name = 'razorpay';
  private keyId: string | undefined;
  private keySecret: string | undefined;
  private webhookSecret: string | undefined;
  private client: Razorpay | null = null;

  constructor(options?: RazorpayOptions) {
    this.keyId = options?.keyId ?? env.RAZORPAY_KEY_ID;
    this.keySecret = options?.keySecret ?? env.RAZORPAY_KEY_SECRET;
    this.webhookSecret = options?.webhookSecret ?? env.RAZORPAY_WEBHOOK_SECRET;

    if (this.keyId && this.keySecret) {
      this.client = new Razorpay({
        key_id: this.keyId,
        key_secret: this.keySecret,
      });
    }
  }

  public getPublicConfig() {
    return {
      provider: 'razorpay',
      keyId: this.keyId,
    };
  }

  private getClient(): Razorpay {
    if (!this.client) {
      if (this.keyId && this.keySecret) {
        this.client = new Razorpay({
          key_id: this.keyId,
          key_secret: this.keySecret,
        });
      } else {
        throw new ServiceUnavailableError(
          'Razorpay payment provider is not configured. Missing API credentials.',
          ErrorCode.BILLING_UNAVAILABLE,
        );
      }
    }
    return this.client;
  }

  public async createCheckoutIntent(
    input: CreateCheckoutIntentInput,
  ): Promise<CheckoutIntentResult> {
    const client = this.getClient();

    const receipt = `rcpt_${input.businessId.slice(-8)}_${Date.now()}`;

    try {
      const order = await client.orders.create({
        amount: input.amount, // in integer minor units (paise)
        currency: input.currency,
        receipt,
        notes: {
          businessId: input.businessId,
          ownerId: input.ownerId,
          planId: input.planId,
          interval: input.interval,
        },
      });

      logger.info(
        {
          provider: 'razorpay',
          orderId: order.id,
          businessId: input.businessId,
          planId: input.planId,
          amount: input.amount,
          currency: input.currency,
        },
        'Successfully generated real Razorpay order for customer checkout',
      );

      return {
        checkoutId: order.id,
        provider: 'razorpay',
        isSimulated: false,
        status: 'initiated',
        amount: Number(order.amount),
        currency: order.currency,
        planId: input.planId,
        interval: input.interval,
        keyId: env.RAZORPAY_KEY_ID, // Safe public key ID for checkout modal
        message: 'Razorpay order created successfully. Awaiting customer checkout.',
      };
    } catch (err: unknown) {
      logger.error({ err, planId: input.planId }, 'Razorpay order creation failed');
      throw new ServiceUnavailableError(
        'Unable to initialize payment with Razorpay. Please try again shortly.',
        ErrorCode.BILLING_UNAVAILABLE,
      );
    }
  }

  /**
   * Verifies checkout payment signature received from client using HMAC SHA-256.
   * Format: HMAC_SHA256(order_id + '|' + payment_id, secret)
   */
  public async verifyPaymentSignature(input: VerifyPaymentInput): Promise<boolean> {
    const secret = this.keySecret;
    if (!secret || !input.orderId || !input.paymentId || !input.signature) {
      return false;
    }

    try {
      const payload = `${input.orderId}|${input.paymentId}`;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      const expectedBuf = Buffer.from(expectedSignature, 'utf-8');
      const actualBuf = Buffer.from(input.signature, 'utf-8');

      if (expectedBuf.length !== actualBuf.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuf, actualBuf);
    } catch (err) {
      logger.error({ err }, 'Error during payment signature verification');
      return false;
    }
  }

  /**
   * Verifies Razorpay webhook signature using the exact raw request payload and webhook secret.
   * Format: HMAC_SHA256(rawBody, webhook_secret) === x-razorpay-signature
   */
  public verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean {
    const secret = this.webhookSecret;
    if (!secret || !rawBody || !signature) {
      return false;
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

      const expectedBuf = Buffer.from(expectedSignature, 'utf-8');
      const actualBuf = Buffer.from(signature, 'utf-8');

      if (expectedBuf.length !== actualBuf.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuf, actualBuf);
    } catch (err) {
      logger.error({ err }, 'Error during webhook signature verification');
      return false;
    }
  }
}

export const razorpayPaymentProvider = new RazorpayPaymentProvider();
