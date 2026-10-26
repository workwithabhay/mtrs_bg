import { Schema, model, type Model } from 'mongoose';
import type { IWebhookEventDocument } from '../billing.types.js';

const webhookEventSchema = new Schema<IWebhookEventDocument>(
  {
    provider: {
      type: String,
      enum: ['razorpay'],
      required: true,
      default: 'razorpay',
    },
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      index: true,
    },
    processed: {
      type: Boolean,
      required: true,
      default: false,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    payload: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    error: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
webhookEventSchema.index({ createdAt: -1 });

export const WebhookEvent: Model<IWebhookEventDocument> = model<IWebhookEventDocument>(
  'WebhookEvent',
  webhookEventSchema,
);
