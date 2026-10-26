import { Schema, model, type Model } from 'mongoose';
import type { IPaymentEventDocument } from '../billing.types.js';

const paymentEventSchema = new Schema<IPaymentEventDocument>(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    subscriptionId: {
      type: Schema.Types.ObjectId,
      ref: 'Subscription',
      default: null,
      index: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: ['mock', 'razorpay', 'promo'],
      required: true,
      default: 'mock',
    },
    isSimulated: {
      type: Boolean,
      required: true,
      default: false,
    },
    eventType: {
      type: String,
      enum: [
        'checkout.initiated',
        'payment.succeeded',
        'payment.failed',
        'subscription.cancelled',
        'promo.redeemed',
      ],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'success', 'failed'],
      required: true,
      default: 'pending',
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    }, // Stored in minor units (integer paise / cents)
    currency: {
      type: String,
      required: true,
      uppercase: true,
      default: 'INR',
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    paymentReference: {
      type: String,
      default: null,
    },
    checkoutId: {
      type: String,
      default: null,
      index: true,
    },
    failureReason: {
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

paymentEventSchema.index({ businessId: 1, createdAt: -1 });
paymentEventSchema.index({ checkoutId: 1, status: 1 });

export const PaymentEvent: Model<IPaymentEventDocument> = model<IPaymentEventDocument>(
  'PaymentEvent',
  paymentEventSchema,
);
