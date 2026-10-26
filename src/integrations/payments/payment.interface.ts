export type BillingInterval = 'monthly' | 'five_month' | 'yearly' | 'package';

export interface CreateCheckoutIntentInput {
  businessId: string;
  ownerId: string;
  planId: string;
  planName: string;
  amount: number; // Integer minor units (e.g. 9900 for 99.00 INR, 39900 for 399.00 INR)
  currency: string;
  interval: BillingInterval;
  simulateSuccess?: boolean;
  metadata?: Record<string, unknown>;
}

export interface CheckoutIntentResult {
  checkoutId: string;
  provider: 'mock' | 'razorpay';
  isSimulated: boolean;
  status: 'initiated' | 'succeeded' | 'failed';
  amount: number;
  currency: string;
  planId: string;
  interval: BillingInterval;
  keyId?: string; // Public Razorpay Key ID for client modal
  paymentReference?: string;
  message: string;
  instructions?: string;
}

export interface VerifyPaymentInput {
  orderId: string;
  paymentId: string;
  signature: string;
}

export interface PaymentProvider {
  readonly name: string;
  createCheckoutIntent(input: CreateCheckoutIntentInput): Promise<CheckoutIntentResult>;
  verifyPaymentSignature(input: VerifyPaymentInput): Promise<boolean>;
  verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean;
}
