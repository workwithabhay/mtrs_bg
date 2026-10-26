import { Types } from 'mongoose';
import { Plan, seedDefaultPlans } from './models/plan.model.js';
import { Subscription } from './models/subscription.model.js';
import { PaymentEvent } from './models/payment-event.model.js';
import { PromoRedemption } from './models/promo-redemption.model.js';
import { Promotion } from './models/promotion.model.js';
import { WebhookEvent } from './models/webhook-event.model.js';
import { Business } from '../businesses/business.model.js';
import { getPaymentProvider } from '../../integrations/payments/index.js';
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
} from '../../common/errors/app-error.js';
import {
  addCalendarMonths,
  calculateTrialEnd,
  LIFETIME_SENTINEL_DATE,
} from '../../common/utils/calendar-math.js';
import { logger } from '../../common/utils/logger.js';
import type {
  CheckoutInput,
  VerifyPaymentInput,
  PaymentHistoryQuery,
} from './billing.validation.js';
import type { EntitlementInfo } from './billing.types.js';

export class BillingService {
  /**
   * List all public active published subscription plans.
   */
  public async listPlans() {
    const count = await Plan.countDocuments();
    if (count === 0) {
      await seedDefaultPlans();
    }

    const plans = await Plan.find({ isPublished: true }).sort({ sortOrder: 1 }).lean();

    return plans.map((p) => ({
      planId: p.planId,
      name: p.name,
      description: p.description,
      price: p.price,
      currency: p.currency,
      interval: p.interval,
      features: p.features,
      limits: p.limits,
    }));
  }

  /**
   * Initializes a 7-day free trial persistently for a newly created business account.
   * Deterministically calculates trial start and expiry on the server.
   */
  public async initializeTrial(
    businessId: string | Types.ObjectId,
    ownerId: string | Types.ObjectId,
  ) {
    const bId = typeof businessId === 'string' ? new Types.ObjectId(businessId) : businessId;
    const oId = typeof ownerId === 'string' ? new Types.ObjectId(ownerId) : ownerId;

    const existing = await Subscription.findOne({ businessId: bId });
    if (existing) {
      return existing;
    }

    const now = new Date();
    const trialEndsAt = calculateTrialEnd(now);

    const subscription = await Subscription.create({
      businessId: bId,
      ownerId: oId,
      planId: 'trial',
      status: 'active',
      entitlementSource: 'trial',
      billingInterval: 'monthly',
      priceSnapshot: { amount: 0, currency: 'INR' },
      currentPeriodStart: now,
      currentPeriodEnd: trialEndsAt,
      trialEndsAt,
      cancelAtPeriodEnd: false,
    });

    logger.info(
      {
        businessId: bId.toString(),
        trialEndsAt: trialEndsAt.toISOString(),
      },
      'Initialized 7-day free trial persistently for new account',
    );

    return subscription;
  }

  /**
   * Resolves the subscription record for an authenticated business.
   * If the business predates the persistent subscription record, evaluates their
   * original creation date to backfill remaining trial or mark trial_expired fairly.
   */
  public async getSubscription(businessId: string | Types.ObjectId) {
    const bId = typeof businessId === 'string' ? new Types.ObjectId(businessId) : businessId;
    let subscription = await Subscription.findOne({ businessId: bId });

    if (!subscription) {
      // Safe backfill policy for pre-existing accounts
      const business = await Business.findById(bId);
      if (!business) {
        throw new NotFoundError('Business account not found.');
      }

      const now = new Date();
      const trialEndsAt = calculateTrialEnd(business.createdAt || now);
      const isStillInTrial = now.getTime() < trialEndsAt.getTime();

      subscription = await Subscription.create({
        businessId: bId,
        ownerId: business.ownerId,
        planId: 'trial',
        status: isStillInTrial ? 'active' : 'trial_expired',
        entitlementSource: isStillInTrial ? 'trial' : 'none',
        billingInterval: 'monthly',
        priceSnapshot: { amount: 0, currency: 'INR' },
        currentPeriodStart: business.createdAt || now,
        currentPeriodEnd: trialEndsAt,
        trialEndsAt,
        cancelAtPeriodEnd: false,
      });

      logger.info(
        {
          businessId: bId.toString(),
          isStillInTrial,
          trialEndsAt: trialEndsAt.toISOString(),
        },
        'Backfilled persistent subscription record for existing business account',
      );
    }

    const plan = await Plan.findOne({ planId: subscription.planId }).lean();
    const entitlement = await this.getEntitlement(bId);

    const isLifetime = subscription.entitlementSource === 'promo_free4you';

    return {
      id: subscription._id,
      planId: subscription.planId,
      planName: plan?.name ?? (isLifetime ? 'Lifetime Free Access' : subscription.planId),
      status: subscription.status,
      entitlementStatus: entitlement.status,
      canAccessProduct: entitlement.canAccessProduct,
      entitlementSource: subscription.entitlementSource,
      billingInterval: subscription.billingInterval,
      priceSnapshot: subscription.priceSnapshot,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      trialEndsAt: subscription.trialEndsAt ?? null,
      daysRemaining: entitlement.daysRemaining,
      isLifetime,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      cancelledAt: subscription.cancelledAt ?? null,
      features: plan?.features ?? [],
      limits: plan?.limits ?? null,
    };
  }

  /**
   * Computes the explicit server-side entitlement status for a business.
   * Distinguishes trial_active, trial_expired, paid_active, promo_active,
   * subscription_expired, payment_pending, payment_failed, and restricted.
   */
  public async getEntitlement(businessId: string | Types.ObjectId): Promise<EntitlementInfo> {
    const bId = typeof businessId === 'string' ? new Types.ObjectId(businessId) : businessId;
    let subscription = await Subscription.findOne({ businessId: bId });

    if (!subscription) {
      // Evaluate existing account creation date
      const business = await Business.findById(bId);
      if (!business) {
        return {
          status: 'restricted',
          canAccessProduct: false,
          reason: 'No business profile associated with account.',
          entitlementSource: 'none',
          planId: 'none',
          planName: 'None',
          currentPeriodEnd: null,
          trialEndsAt: null,
          daysRemaining: null,
          isLifetime: false,
          features: [],
          limits: null,
        };
      }

      const now = new Date();
      const trialEndsAt = calculateTrialEnd(business.createdAt || now);
      const isStillInTrial = now.getTime() < trialEndsAt.getTime();

      subscription = await Subscription.create({
        businessId: bId,
        ownerId: business.ownerId,
        planId: 'trial',
        status: isStillInTrial ? 'active' : 'trial_expired',
        entitlementSource: isStillInTrial ? 'trial' : 'none',
        billingInterval: 'monthly',
        priceSnapshot: { amount: 0, currency: 'INR' },
        currentPeriodStart: business.createdAt || now,
        currentPeriodEnd: trialEndsAt,
        trialEndsAt,
        cancelAtPeriodEnd: false,
      });
    }

    const now = new Date();
    const plan = await Plan.findOne({ planId: subscription.planId }).lean();
    const planName = plan?.name || subscription.planId;
    const features = plan?.features || [];
    const limits = plan?.limits || null;

    // 1. Promotional Lifetime Access (FREE4YOU)
    if (subscription.entitlementSource === 'promo_free4you') {
      return {
        status: 'promo_active',
        canAccessProduct: true,
        reason: 'Lifetime-free promotional access active (FREE4YOU).',
        entitlementSource: 'promo_free4you',
        planId: subscription.planId,
        planName: plan?.name || 'Lifetime Free Access',
        currentPeriodEnd: subscription.currentPeriodEnd,
        trialEndsAt: null,
        daysRemaining: null,
        isLifetime: true,
        features,
        limits,
      };
    }

    // 2. Paid Subscription or Package
    if (
      subscription.entitlementSource === 'paid_subscription' ||
      subscription.entitlementSource === 'paid_package'
    ) {
      if (subscription.status === 'active' && subscription.currentPeriodEnd.getTime() > now.getTime()) {
        const msRemaining = subscription.currentPeriodEnd.getTime() - now.getTime();
        const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));

        return {
          status: 'paid_active',
          canAccessProduct: true,
          reason: 'Active paid subscription.',
          entitlementSource: subscription.entitlementSource,
          planId: subscription.planId,
          planName,
          currentPeriodEnd: subscription.currentPeriodEnd,
          trialEndsAt: null,
          daysRemaining,
          isLifetime: false,
          features,
          limits,
        };
      }

      // Paid period expired
      if (subscription.currentPeriodEnd.getTime() <= now.getTime()) {
        if (subscription.status !== 'expired') {
          subscription.status = 'expired';
          await subscription.save();
        }

        return {
          status: 'subscription_expired',
          canAccessProduct: false,
          reason: 'Paid subscription period has expired. Please renew your plan.',
          entitlementSource: subscription.entitlementSource,
          planId: subscription.planId,
          planName,
          currentPeriodEnd: subscription.currentPeriodEnd,
          trialEndsAt: null,
          daysRemaining: 0,
          isLifetime: false,
          features,
          limits,
        };
      }
    }

    // 3. Seven-Day Free Trial
    if (
      subscription.entitlementSource === 'trial' ||
      subscription.status === 'trial_expired' ||
      subscription.planId === 'trial'
    ) {
      const trialEnds = subscription.trialEndsAt || subscription.currentPeriodEnd || now;

      if (trialEnds.getTime() > now.getTime() && subscription.status === 'active') {
        const msRemaining = trialEnds.getTime() - now.getTime();
        const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));

        return {
          status: 'trial_active',
          canAccessProduct: true,
          reason: `7-day trial active (${daysRemaining} day(s) remaining).`,
          entitlementSource: 'trial',
          planId: 'trial',
          planName: '7-Day Free Trial',
          currentPeriodEnd: trialEnds,
          trialEndsAt: trialEnds,
          daysRemaining,
          isLifetime: false,
          features,
          limits,
        };
      }

      // Trial expired
      if (subscription.status !== 'trial_expired') {
        subscription.status = 'trial_expired';
        subscription.entitlementSource = 'none';
        await subscription.save();
      }

      return {
        status: 'trial_expired',
        canAccessProduct: false,
        reason: 'Your 7-day free trial has expired. Please choose a plan to continue.',
        entitlementSource: 'none',
        planId: 'trial',
        planName: '7-Day Free Trial',
        currentPeriodEnd: trialEnds,
        trialEndsAt: trialEnds,
        daysRemaining: 0,
        isLifetime: false,
        features,
        limits,
      };
    }

    // 4. Default restricted
    return {
      status: 'restricted',
      canAccessProduct: false,
      reason: 'No active entitlement found. Subscription required.',
      entitlementSource: 'none',
      planId: subscription.planId || 'none',
      planName: planName || 'None',
      currentPeriodEnd: subscription.currentPeriodEnd || null,
      trialEndsAt: subscription.trialEndsAt || null,
      daysRemaining: 0,
      isLifetime: false,
      features,
      limits,
    };
  }

  /**
   * Initiates payment checkout for an authorized plan.
   * Prices and currencies are strictly calculated on the server.
   */
  public async createCheckout(
    businessId: string | Types.ObjectId,
    ownerId: string | Types.ObjectId,
    input: CheckoutInput,
  ) {
    const bId = typeof businessId === 'string' ? new Types.ObjectId(businessId) : businessId;
    const oId = typeof ownerId === 'string' ? new Types.ObjectId(ownerId) : ownerId;

    // Ensure default plans are available
    if ((await Plan.countDocuments()) === 0) {
      await seedDefaultPlans();
    }

    // 1. Fetch and validate plan server-side
    const plan = await Plan.findOne({
      planId: input.planId.toLowerCase(),
      isPublished: true,
    });

    if (!plan) {
      throw new BadRequestError('Selected plan is either invalid or currently unavailable.');
    }

    // 2. Strict commercial rules: resolve server-side price
    // Plan A: Monthly = 9900 paise (₹99)
    // Plan B: Five-month = 39900 paise (₹399)
    let amount = plan.price;
    let interval = plan.interval;

    if (plan.planId === 'monthly') {
      amount = 9900;
      interval = 'monthly';
    } else if (plan.planId === 'five_month') {
      amount = 39900;
      interval = 'five_month';
    }

    // 3. Obtain configured payment provider
    const provider = getPaymentProvider();

    // 4. Generate checkout intent via provider
    const intentResult = await provider.createCheckoutIntent({
      businessId: bId.toString(),
      ownerId: oId.toString(),
      planId: plan.planId,
      planName: plan.name,
      amount,
      currency: plan.currency,
      interval,
      simulateSuccess: input.simulateSuccess,
    });

    // 5. Handle simulated failure (for mock provider test suite)
    if (intentResult.status === 'failed') {
      await PaymentEvent.create({
        businessId: bId,
        ownerId: oId,
        provider: intentResult.provider,
        isSimulated: intentResult.isSimulated,
        eventType: 'payment.failed',
        status: 'failed',
        amount,
        currency: plan.currency,
        idempotencyKey: `pay_evt_fail_${intentResult.checkoutId}`,
        checkoutId: intentResult.checkoutId,
        failureReason: 'Simulated payment failure requested.',
      });

      return {
        checkoutId: intentResult.checkoutId,
        status: 'failed',
        isSimulated: intentResult.isSimulated,
        message: intentResult.message,
      };
    }

    // 6. Record pending checkout payment event
    const idempotencyKey = `pay_evt_${intentResult.checkoutId}`;

    await PaymentEvent.create({
      businessId: bId,
      ownerId: oId,
      provider: intentResult.provider,
      isSimulated: intentResult.isSimulated,
      eventType: 'checkout.initiated',
      status: 'pending',
      amount,
      currency: plan.currency,
      idempotencyKey,
      checkoutId: intentResult.checkoutId,
      metadata: { planId: plan.planId, interval },
    });

    // If mock provider simulated success immediately, activate subscription
    if (intentResult.isSimulated && intentResult.status === 'succeeded') {
      return this.activatePaidSubscription(
        bId,
        oId,
        plan.planId,
        amount,
        plan.currency,
        interval,
        intentResult.checkoutId,
        intentResult.paymentReference || `mock_ref_${Date.now()}`,
        'mock',
        true,
      );
    }

    // Return safe checkout details for Razorpay modal
    return {
      checkoutId: intentResult.checkoutId,
      provider: intentResult.provider,
      isSimulated: intentResult.isSimulated,
      status: 'initiated',
      amount,
      currency: plan.currency,
      planId: plan.planId,
      interval,
      keyId: intentResult.keyId,
      message: intentResult.message,
    };
  }

  /**
   * Verifies Razorpay client checkout signature and activates paid access.
   * Completely idempotent against duplicate submissions.
   */
  public async verifyPayment(
    businessId: string | Types.ObjectId,
    ownerId: string | Types.ObjectId,
    input: VerifyPaymentInput,
  ) {
    const bId = typeof businessId === 'string' ? new Types.ObjectId(businessId) : businessId;
    const oId = typeof ownerId === 'string' ? new Types.ObjectId(ownerId) : ownerId;

    const provider = getPaymentProvider();

    // 1. Verify checkout signature with timing-safe comparison
    const isValid = await provider.verifyPaymentSignature(input);
    if (!isValid) {
      logger.warn(
        { orderId: input.orderId, businessId: bId.toString() },
        'Payment signature verification failed',
      );
      throw new BadRequestError('Invalid payment verification signature.');
    }

    // 2. Find associated checkout event
    const paymentEvent = await PaymentEvent.findOne({ checkoutId: input.orderId });
    if (!paymentEvent) {
      throw new NotFoundError('Associated checkout order could not be located.');
    }

    // Prevent cross-tenant tampering
    if (paymentEvent.businessId.toString() !== bId.toString()) {
      throw new UnauthorizedError('Unauthorized checkout order.');
    }

    // 3. Idempotency check: If already processed successfully, return current subscription
    if (paymentEvent.status === 'success') {
      const currentSub = await this.getSubscription(bId);
      return {
        verified: true,
        isIdempotent: true,
        message: 'Payment was already verified and credited.',
        subscription: currentSub,
      };
    }

    const planId = (paymentEvent.metadata?.planId as string) || 'monthly';
    const interval = (paymentEvent.metadata?.interval as string) || 'monthly';

    // 4. Activate paid entitlement
    return this.activatePaidSubscription(
      bId,
      oId,
      planId,
      paymentEvent.amount,
      paymentEvent.currency,
      interval,
      input.orderId,
      input.paymentId,
      paymentEvent.provider,
      paymentEvent.isSimulated,
    );
  }

  /**
   * Internal helper: Activates or extends paid access accurately.
   */
  private async activatePaidSubscription(
    businessId: Types.ObjectId,
    ownerId: Types.ObjectId,
    planId: string,
    amount: number,
    currency: string,
    interval: string,
    checkoutId: string,
    paymentReference: string,
    provider: 'mock' | 'razorpay' | 'promo',
    isSimulated: boolean,
  ) {
    const now = new Date();
    let periodEnd: Date;
    let entitlementSource: 'paid_subscription' | 'paid_package' = 'paid_subscription';

    if (planId === 'five_month' || interval === 'five_month') {
      periodEnd = addCalendarMonths(now, 5);
      entitlementSource = 'paid_package';
    } else {
      periodEnd = addCalendarMonths(now, 1);
      entitlementSource = 'paid_subscription';
    }

    // Update payment event to success
    await PaymentEvent.findOneAndUpdate(
      { checkoutId },
      {
        $set: {
          status: 'success',
          eventType: 'payment.succeeded',
          paymentReference,
          provider,
        },
      },
    );

    const subscription = await Subscription.findOneAndUpdate(
      { businessId },
      {
        $set: {
          ownerId,
          planId,
          status: 'active',
          entitlementSource,
          billingInterval: interval,
          priceSnapshot: { amount, currency },
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
          cancelledAt: null,
          providerOrderId: checkoutId,
          providerPaymentId: paymentReference,
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );

    logger.info(
      {
        businessId: businessId.toString(),
        planId,
        entitlementSource,
        periodEnd: periodEnd.toISOString(),
      },
      'Activated paid subscription entitlement successfully',
    );

    return {
      verified: true,
      checkoutId,
      paymentReference,
      status: 'succeeded',
      isSimulated,
      amount,
      currency,
      subscription: {
        id: subscription._id,
        planId: subscription.planId,
        status: subscription.status,
        entitlementSource: subscription.entitlementSource,
        priceSnapshot: subscription.priceSnapshot,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
      },
      message: 'Payment verified successfully and paid access activated.',
    };
  }

  /**
   * Handles incoming Razorpay webhooks with raw body signature verification
   * and idempotent deduplication.
   */
  public async handleWebhook(rawBody: Buffer | string | undefined, signature: string | undefined) {
    if (!rawBody || !signature) {
      throw new BadRequestError('Missing webhook body or x-razorpay-signature header.');
    }

    const provider = getPaymentProvider();

    // 1. Verify webhook signature
    const isValid = provider.verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      logger.warn('Razorpay webhook signature verification failed');
      throw new BadRequestError('Invalid webhook signature.');
    }

    // 2. Parse payload safely
    let event: Record<string, unknown>;
    try {
      const bodyString = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');
      event = JSON.parse(bodyString);
    } catch {
      throw new BadRequestError('Invalid JSON payload in webhook.');
    }

    const eventId = String(event.id || event.event_id || '');
    const eventType = String(event.event || '');

    if (!eventId) {
      throw new BadRequestError('Webhook event ID is missing.');
    }

    // 3. Idempotency check: Persist webhook event and deduplicate
    const existingWebhook = await WebhookEvent.findOne({ eventId });
    if (existingWebhook && existingWebhook.processed) {
      return {
        status: 'ignored',
        duplicate: true,
        message: 'Webhook event already processed (idempotent duplicate).',
      };
    }

    const webhookRecord =
      existingWebhook ||
      (await WebhookEvent.create({
        provider: 'razorpay',
        eventId,
        eventType,
        payload: event,
        processed: false,
      }));

    try {
      // 4. Handle specific event types
      if (eventType === 'order.paid' || eventType === 'payment.captured') {
        const payloadData = event.payload as Record<string, unknown> | undefined;
        const orderData = (payloadData?.order as Record<string, unknown>)?.entity as
          | Record<string, unknown>
          | undefined;
        const paymentData = (payloadData?.payment as Record<string, unknown>)?.entity as
          | Record<string, unknown>
          | undefined;

        const orderId = orderData?.id ? String(orderData.id) : undefined;
        const paymentId = paymentData?.id ? String(paymentData.id) : undefined;

        if (orderId) {
          const paymentEvent = await PaymentEvent.findOne({ checkoutId: orderId });
          if (paymentEvent && paymentEvent.status !== 'success') {
            await this.activatePaidSubscription(
              paymentEvent.businessId,
              paymentEvent.ownerId,
              (paymentEvent.metadata?.planId as string) || 'monthly',
              paymentEvent.amount,
              paymentEvent.currency,
              (paymentEvent.metadata?.interval as string) || 'monthly',
              orderId,
              paymentId || `pay_wh_${Date.now()}`,
              'razorpay',
              false,
            );
          }
        }
      } else if (eventType === 'payment.failed') {
        const payloadData = event.payload as Record<string, unknown> | undefined;
        const paymentData = (payloadData?.payment as Record<string, unknown>)?.entity as
          | Record<string, unknown>
          | undefined;
        const orderId = paymentData?.order_id ? String(paymentData.order_id) : undefined;

        if (orderId) {
          await PaymentEvent.findOneAndUpdate(
            { checkoutId: orderId, status: 'pending' },
            {
              $set: {
                status: 'failed',
                eventType: 'payment.failed',
                failureReason: String(paymentData?.error_description || 'Payment failed on Razorpay'),
              },
            },
          );
        }
      }

      webhookRecord.processed = true;
      webhookRecord.processedAt = new Date();
      await webhookRecord.save();

      return {
        status: 'processed',
        eventId,
        eventType,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown webhook error';
      webhookRecord.error = msg;
      await webhookRecord.save();
      throw err;
    }
  }

  /**
   * Redeems the FREE4YOU promotional code for lifetime-free access.
   * Atomically prevents duplicate or concurrent double redemption per business.
   */
  public async redeemPromoCode(
    businessId: string | Types.ObjectId,
    ownerId: string | Types.ObjectId,
    rawCode: string,
    ipAddress?: string,
  ) {
    const bId = typeof businessId === 'string' ? new Types.ObjectId(businessId) : businessId;
    const oId = typeof ownerId === 'string' ? new Types.ObjectId(ownerId) : ownerId;

    const normalizedCode = (rawCode || '').trim().toUpperCase();

    if (normalizedCode !== 'FREE4YOU') {
      throw new BadRequestError('Invalid or unsupported promotional code.');
    }

    // Verify promotion lifecycle status
    const promo = await Promotion.findOne({ code: 'FREE4YOU' });
    if (promo) {
      if (promo.status === 'paused') {
        throw new BadRequestError('Promotional code FREE4YOU is temporarily paused.');
      }
      if (promo.status === 'retired') {
        throw new BadRequestError('Promotional code FREE4YOU has been retired and is no longer available.');
      }
    }

    // Check if account already redeemed
    const existing = await PromoRedemption.findOne({
      code: 'FREE4YOU',
      $or: [{ businessId: bId }, { ownerId: oId }],
    });

    if (existing) {
      throw new ConflictError('Promotional code FREE4YOU has already been redeemed for this account.');
    }

    // Atomic insert with compound unique index
    try {
      await PromoRedemption.create({
        code: 'FREE4YOU',
        businessId: bId,
        ownerId: oId,
        ipAddress: ipAddress || null,
        redeemedAt: new Date(),
      });
    } catch (err: unknown) {
      // MongoDB duplicate key error code 11000
      if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000) {
        throw new ConflictError(
          'Promotional code FREE4YOU has already been redeemed for this account.',
        );
      }
      throw err;
    }

    const now = new Date();

    // Record promo payment event
    await PaymentEvent.create({
      businessId: bId,
      ownerId: oId,
      provider: 'promo',
      isSimulated: false,
      eventType: 'promo.redeemed',
      status: 'success',
      amount: 0,
      currency: 'INR',
      idempotencyKey: `promo_free4you_${bId.toString()}`,
      paymentReference: 'FREE4YOU_LIFETIME',
      metadata: { code: 'FREE4YOU', redeemedAt: now },
    });

    // Update subscription to lifetime promo entitlement
    const subscription = await Subscription.findOneAndUpdate(
      { businessId: bId },
      {
        $set: {
          ownerId: oId,
          planId: 'free4you',
          status: 'active',
          entitlementSource: 'promo_free4you',
          billingInterval: 'monthly',
          priceSnapshot: { amount: 0, currency: 'INR' },
          currentPeriodStart: now,
          currentPeriodEnd: LIFETIME_SENTINEL_DATE,
          cancelAtPeriodEnd: false,
          cancelledAt: null,
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );

    logger.info(
      {
        businessId: bId.toString(),
        ownerId: oId.toString(),
        code: 'FREE4YOU',
      },
      'Successfully redeemed FREE4YOU promotional code for lifetime-free access',
    );

    return {
      success: true,
      code: 'FREE4YOU',
      message: 'Promotional code FREE4YOU redeemed successfully! Lifetime-free access granted.',
      isLifetime: true,
      subscription: {
        id: subscription._id,
        planId: subscription.planId,
        status: subscription.status,
        entitlementSource: subscription.entitlementSource,
        priceSnapshot: subscription.priceSnapshot,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
      },
    };
  }

  /**
   * Request subscription cancellation.
   */
  public async cancelSubscription(
    businessId: string | Types.ObjectId,
    ownerId: string | Types.ObjectId,
    immediate = false,
  ) {
    const bId = typeof businessId === 'string' ? new Types.ObjectId(businessId) : businessId;
    const oId = typeof ownerId === 'string' ? new Types.ObjectId(ownerId) : ownerId;

    const subscription = await Subscription.findOne({ businessId: bId });

    if (!subscription) {
      throw new NotFoundError('No active subscription found to cancel.');
    }

    if (subscription.status === 'cancelled') {
      return {
        isCancelled: true,
        status: 'cancelled',
        cancelledAt: subscription.cancelledAt,
        message: 'Subscription is already cancelled.',
      };
    }

    const now = new Date();

    if (immediate) {
      subscription.status = 'cancelled';
      subscription.cancelAtPeriodEnd = false;
      subscription.cancelledAt = now;
    } else {
      subscription.cancelAtPeriodEnd = true;
      subscription.cancelledAt = now;
    }

    await subscription.save();

    await PaymentEvent.create({
      businessId: bId,
      subscriptionId: subscription._id,
      ownerId: oId,
      provider: 'mock',
      isSimulated: true,
      eventType: 'subscription.cancelled',
      status: 'success',
      amount: 0,
      currency: subscription.priceSnapshot.currency,
      idempotencyKey: `sub_cancel_${subscription._id}_${now.getTime()}`,
      metadata: { immediate, cancelledAt: now },
    });

    return {
      isCancelled: true,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      cancelledAt: subscription.cancelledAt,
      currentPeriodEnd: subscription.currentPeriodEnd,
      message: immediate
        ? 'Subscription has been cancelled immediately.'
        : 'Subscription will remain active until the end of the current billing period.',
    };
  }

  /**
   * List paginated payment events for the authenticated business.
   */
  public async getPaymentHistory(businessId: string | Types.ObjectId, query: PaymentHistoryQuery) {
    const bId = typeof businessId === 'string' ? new Types.ObjectId(businessId) : businessId;
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(20, Math.max(1, query.limit || 10));
    const skip = (page - 1) * limit;

    const [total, events] = await Promise.all([
      PaymentEvent.countDocuments({ businessId: bId }),
      PaymentEvent.find({ businessId: bId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    const items = events.map((event) => ({
      id: event._id,
      provider: event.provider,
      isSimulated: event.isSimulated,
      eventType: event.eventType,
      status: event.status,
      amount: event.amount,
      currency: event.currency,
      checkoutId: event.checkoutId ?? null,
      paymentReference: event.paymentReference ?? null,
      failureReason: event.failureReason ?? null,
      createdAt: event.createdAt,
    }));

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export const billingService = new BillingService();
