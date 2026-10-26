import { Schema, model, type Model, type Document } from 'mongoose';

export type PromotionStatus = 'active' | 'paused' | 'retired';

export interface IPromotion {
  code: string;
  name: string;
  description?: string;
  status: PromotionStatus;
  pausedAt?: Date | null;
  retiredAt?: Date | null;
  migrationDeadline?: Date | null;
  gracePeriodDays?: number;
  retirementReason?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export type IPromotionDocument = IPromotion & Document;

const promotionSchema = new Schema<IPromotionDocument>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['active', 'paused', 'retired'],
      required: true,
      default: 'active',
      index: true,
    },
    pausedAt: {
      type: Date,
      default: null,
    },
    retiredAt: {
      type: Date,
      default: null,
    },
    migrationDeadline: {
      type: Date,
      default: null,
    },
    gracePeriodDays: {
      type: Number,
      default: 30,
    },
    retirementReason: {
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

export const Promotion: Model<IPromotionDocument> = model<IPromotionDocument>(
  'Promotion',
  promotionSchema,
);
