import { Schema, model, type Model } from 'mongoose';
import type { IPromoRedemptionDocument } from '../billing.types.js';

const promoRedemptionSchema = new Schema<IPromoRedemptionDocument>(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    redeemedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    ipAddress: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Prevent repeated or concurrent double redemption per business or account
promoRedemptionSchema.index({ code: 1, businessId: 1 }, { unique: true });
promoRedemptionSchema.index({ code: 1, ownerId: 1 }, { unique: true });

export const PromoRedemption: Model<IPromoRedemptionDocument> = model<IPromoRedemptionDocument>(
  'PromoRedemption',
  promoRedemptionSchema,
);
