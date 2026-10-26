import { Schema, model, type Model, type Document, type Types } from 'mongoose';

export interface IQrEventMetadata {
  referrer?: string;
  language?: string;
  destinationUrl?: string;
}

export interface IQrEvent {
  campaignId: Types.ObjectId;
  businessId: Types.ObjectId;
  eventType: 'scan' | 'google_review_click';
  metadata?: IQrEventMetadata;
  createdAt: Date;
}

export interface IQrEventDocument extends IQrEvent, Document<Types.ObjectId> {}

const qrEventSchema = new Schema<IQrEventDocument>(
  {
    campaignId: {
      type: Schema.Types.ObjectId,
      ref: 'QrCampaign',
      required: true,
      index: true,
    },
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    eventType: {
      type: String,
      enum: ['scan', 'google_review_click'],
      default: 'scan',
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    strict: true,
  },
);

// Compound indexes for time-series scan analytics
qrEventSchema.index({ campaignId: 1, createdAt: -1 });
qrEventSchema.index({ businessId: 1, createdAt: -1 });
qrEventSchema.index({ businessId: 1, eventType: 1, createdAt: -1 });
qrEventSchema.index({ campaignId: 1, eventType: 1, createdAt: -1 });

export const QrEvent: Model<IQrEventDocument> = model<IQrEventDocument>('QrEvent', qrEventSchema);
