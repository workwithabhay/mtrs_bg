import type { Types, Document } from 'mongoose';

export type PlanInterval = 'monthly' | 'five_month' | 'yearly' | 'package';

export type SubscriptionStatus =
  | 'pending'
  | 'active'
  | 'cancelled'
  | 'expired'
  | 'trial_expired'
  | 'past_due';

export type EntitlementStatus =
  | 'trial_active'
  | 'trial_expired'
  | 'paid_active'
  | 'promo_active'
  | 'payment_pending'
  | 'payment_failed'
  | 'subscription_expired'
  | 'restricted';

export type EntitlementSource =
  | 'trial'
  | 'paid_subscription'
  | 'paid_package'
  | 'promo_free4you'
  | 'none';

export type PaymentEventStatus = 'pending' | 'success' | 'failed';

export type PaymentEventType =
  | 'checkout.initiated'
  | 'payment.succeeded'
  | 'payment.failed'
  | 'subscription.cancelled'
  | 'promo.redeemed';

export interface IPlanLimits {
  maxCampaigns: number;
  maxMonthlyScans: number;
  aiAssistanceEnabled: boolean;
}

export interface IPlan {
  planId: string;
  name: string;
  description: string;
  price: number; // Stored as integer minor units (e.g. 0 for free, 9900 for 99.00 INR, 39900 for 399.00 INR)
  currency: string;
  interval: PlanInterval;
  isPublished: boolean;
  features: string[];
  limits: IPlanLimits;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPlanDocument extends IPlan, Document {}

export interface ISubscriptionPriceSnapshot {
  amount: number;
  currency: string;
}

export interface ISubscription {
  businessId: Types.ObjectId;
  ownerId: Types.ObjectId;
  planId: string;
  status: SubscriptionStatus;
  entitlementSource: EntitlementSource;
  billingInterval: PlanInterval;
  priceSnapshot: ISubscriptionPriceSnapshot;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  cancelledAt?: Date | null;
  trialEndsAt?: Date | null;
  lastPaymentEventId?: Types.ObjectId | null;
  providerOrderId?: string | null;
  providerPaymentId?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISubscriptionDocument extends ISubscription, Document {}

export interface IPaymentEvent {
  businessId: Types.ObjectId;
  subscriptionId?: Types.ObjectId | null;
  ownerId: Types.ObjectId;
  provider: 'mock' | 'razorpay' | 'promo';
  isSimulated: boolean;
  eventType: PaymentEventType;
  status: PaymentEventStatus;
  amount: number; // Integer minor units
  currency: string;
  idempotencyKey: string;
  paymentReference?: string | null;
  checkoutId?: string | null;
  failureReason?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPaymentEventDocument extends IPaymentEvent, Document {}

export interface IPromoRedemption {
  code: string;
  businessId: Types.ObjectId;
  ownerId: Types.ObjectId;
  redeemedAt: Date;
  ipAddress?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPromoRedemptionDocument extends IPromoRedemption, Document {}

export interface IWebhookEvent {
  provider: 'razorpay';
  eventId: string;
  eventType: string;
  processed: boolean;
  processedAt?: Date | null;
  payload?: Record<string, unknown>;
  error?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWebhookEventDocument extends IWebhookEvent, Document {}

export interface EntitlementInfo {
  status: EntitlementStatus;
  canAccessProduct: boolean;
  reason: string;
  entitlementSource: EntitlementSource;
  planId: string;
  planName: string;
  currentPeriodEnd: Date | null;
  trialEndsAt: Date | null;
  daysRemaining: number | null;
  isLifetime: boolean;
  features: string[];
  limits: IPlanLimits | null;
}
