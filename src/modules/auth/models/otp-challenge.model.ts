import { Schema, model, type Model, type Document } from 'mongoose';
import type { OtpPurpose } from '../../../integrations/email/email.interface.js';

export interface ISignupMetadata {
  name: string;
  businessName: string;
  category: string;
  googleReviewUrl?: string;
}

export interface IOtpChallenge {
  email: string;
  purpose: OtpPurpose;
  otpHash: string;
  expiresAt: Date;
  attempts: number;
  maxAttempts: number;
  isConsumed: boolean;
  consumedAt?: Date;
  metadata?: ISignupMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export interface IOtpChallengeDocument extends IOtpChallenge, Document {}

const otpChallengeSchema = new Schema<IOtpChallengeDocument>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    purpose: {
      type: String,
      enum: ['signup', 'login'],
      required: true,
      index: true,
    },
    otpHash: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // MongoDB TTL index for automatic physical cleanup
    },
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 3,
    },
    isConsumed: {
      type: Boolean,
      default: false,
      index: true,
    },
    consumedAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
    strict: true,
  },
);

// Compound index for active challenge lookups
otpChallengeSchema.index({ email: 1, purpose: 1, isConsumed: 1 });
otpChallengeSchema.index({ email: 1, createdAt: -1 });

export const OtpChallenge: Model<IOtpChallengeDocument> = model<IOtpChallengeDocument>(
  'OtpChallenge',
  otpChallengeSchema,
);
