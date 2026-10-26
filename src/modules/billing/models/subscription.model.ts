import { Schema, model, type Model } from 'mongoose';
import type { ISubscriptionDocument } from '../billing.types.js';

const priceSnapshotSchema = new Schema(
  {
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, default: 'INR' },
  },
  { _id: false },
);

const subscriptionSchema = new Schema<ISubscriptionDocument>(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      unique: true,
      index: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    planId: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'cancelled', 'expired', 'trial_expired', 'past_due'],
      required: true,
      default: 'active',
      index: true,
    },
    entitlementSource: {
      type: String,
      enum: ['trial', 'paid_subscription', 'paid_package', 'promo_free4you', 'none'],
      required: true,
      default: 'trial',
      index: true,
    },
    billingInterval: {
      type: String,
      enum: ['monthly', 'five_month', 'yearly', 'package'],
      required: true,
      default: 'monthly',
    },
    priceSnapshot: {
      type: priceSnapshotSchema,
      required: true,
    },
    currentPeriodStart: {
      type: Date,
      required: true,
      default: Date.now,
    },
    currentPeriodEnd: {
      type: Date,
      required: true,
      index: true,
    },
    cancelAtPeriodEnd: {
      type: Boolean,
      required: true,
      default: false,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    trialEndsAt: {
      type: Date,
      default: null,
      index: true,
    },
    lastPaymentEventId: {
      type: Schema.Types.ObjectId,
      ref: 'PaymentEvent',
      default: null,
    },
    providerOrderId: {
      type: String,
      default: null,
      index: true,
    },
    providerPaymentId: {
      type: String,
      default: null,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

subscriptionSchema.index({ businessId: 1, status: 1 });
subscriptionSchema.index({ ownerId: 1, status: 1 });
subscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });

export const Subscription: Model<ISubscriptionDocument> = model<ISubscriptionDocument>(
  'Subscription',
  subscriptionSchema,
);
