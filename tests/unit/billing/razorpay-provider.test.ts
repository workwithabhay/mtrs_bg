import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { RazorpayPaymentProvider } from '../../../src/integrations/payments/razorpay-payment.provider.js';
import { MockPaymentProvider } from '../../../src/integrations/payments/mock-payment.provider.js';

describe('Payment Providers Unit Tests', () => {
  const testKeyId = 'rzp_test_1234567890';
  const testKeySecret = 'test_secret_key_abcdef123456';
  const testWebhookSecret = 'webhook_secret_xyz987654321';

  describe('RazorpayPaymentProvider', () => {
    it('initializes successfully with test credentials', () => {
      const provider = new RazorpayPaymentProvider({
        keyId: testKeyId,
        keySecret: testKeySecret,
        webhookSecret: testWebhookSecret,
      });

      expect(provider.name).toBe('razorpay');
      expect(provider.getPublicConfig()).toEqual({
        provider: 'razorpay',
        keyId: testKeyId,
      });
      // Ensure secrets are never exposed in public config
      expect(provider.getPublicConfig()).not.toHaveProperty('keySecret');
      expect(provider.getPublicConfig()).not.toHaveProperty('webhookSecret');
    });

    it('correctly verifies valid checkout HMAC SHA-256 signature', async () => {
      const provider = new RazorpayPaymentProvider({
        keyId: testKeyId,
        keySecret: testKeySecret,
      });

      const orderId = 'order_DAvDpkP99';
      const paymentId = 'pay_DAvE1rA00';
      const expectedPayload = `${orderId}|${paymentId}`;
      const validSignature = crypto
        .createHmac('sha256', testKeySecret)
        .update(expectedPayload)
        .digest('hex');

      const isValid = await provider.verifyPaymentSignature({
        orderId,
        paymentId,
        signature: validSignature,
      });

      expect(isValid).toBe(true);
    });

    it('rejects tampered or invalid checkout signature', async () => {
      const provider = new RazorpayPaymentProvider({
        keyId: testKeyId,
        keySecret: testKeySecret,
      });

      const orderId = 'order_DAvDpkP99';
      const paymentId = 'pay_DAvE1rA00';
      const fakeSignature = 'tampered_signature_1234567890abcdef';

      const isValid = await provider.verifyPaymentSignature({
        orderId,
        paymentId,
        signature: fakeSignature,
      });

      expect(isValid).toBe(false);
    });

    it('verifies valid raw-body webhook HMAC signature', () => {
      const provider = new RazorpayPaymentProvider({
        keyId: testKeyId,
        keySecret: testKeySecret,
        webhookSecret: testWebhookSecret,
      });

      const rawPayload = Buffer.from(
        JSON.stringify({
          entity: 'event',
          account_id: 'acc_123',
          event: 'payment.captured',
          payload: { payment: { entity: { id: 'pay_123' } } },
        }),
      );

      const validSignature = crypto
        .createHmac('sha256', testWebhookSecret)
        .update(rawPayload)
        .digest('hex');

      const isValid = provider.verifyWebhookSignature(rawPayload, validSignature);
      expect(isValid).toBe(true);
    });

    it('rejects tampered webhook payload or mismatched secret', () => {
      const provider = new RazorpayPaymentProvider({
        keyId: testKeyId,
        keySecret: testKeySecret,
        webhookSecret: testWebhookSecret,
      });

      const rawPayload = Buffer.from('{"tampered":true}');
      const forgedSignature = crypto
        .createHmac('sha256', 'wrong_secret')
        .update(rawPayload)
        .digest('hex');

      const isValid = provider.verifyWebhookSignature(rawPayload, forgedSignature);
      expect(isValid).toBe(false);
    });
  });

  describe('MockPaymentProvider Safeguards', () => {
    it('clearly tags checkout intents with isSimulated: true', async () => {
      const mockProvider = new MockPaymentProvider();
      const intent = await mockProvider.createCheckoutIntent({
        businessId: 'bus_test_1',
        ownerId: 'usr_test_1',
        planId: 'monthly',
        planName: 'Monthly Plan',
        amount: 9900,
        currency: 'INR',
        interval: 'monthly',
        simulateSuccess: true,
      });

      expect(intent.provider).toBe('mock');
      expect(intent.isSimulated).toBe(true);
      expect(intent.checkoutId).toMatch(/^mock_chk_/);
      expect(intent.paymentReference).toMatch(/^mock_pay_/);
    });

    it('mock signature verification requires mock_sig_ prefix', async () => {
      const mockProvider = new MockPaymentProvider();
      expect(
        await mockProvider.verifyPaymentSignature({
          orderId: 'mock_chk_1',
          paymentId: 'mock_pay_1',
          signature: 'mock_sig_valid',
        }),
      ).toBe(true);

      // Rejects non-mock signature format
      expect(
        await mockProvider.verifyPaymentSignature({
          orderId: 'order_real_123',
          paymentId: 'pay_real_123',
          signature: 'real_sha256_sig',
        }),
      ).toBe(false);
    });
  });
});
