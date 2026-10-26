import { Schema, model, type Model } from 'mongoose';
import type { IBusinessDocument } from './business.types.js';

const HEX_COLOR_REGEX = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const businessBrandingSchema = new Schema(
  {
    logoUrl: {
      type: String,
      trim: true,
      default: null,
    },
    primaryColor: {
      type: String,
      default: '#2563EB',
      match: [HEX_COLOR_REGEX, 'Primary color must be a valid hex color code (e.g. #2563EB)'],
    },
    secondaryColor: {
      type: String,
      default: '#1E293B',
      match: [HEX_COLOR_REGEX, 'Secondary color must be a valid hex color code (e.g. #1E293B)'],
    },
  },
  { _id: false },
);

const feedbackQuestionSchema = new Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    label: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    type: {
      type: String,
      enum: ['text', 'long_text', 'single_choice'],
      required: true,
    },
    required: {
      type: Boolean,
      default: false,
    },
    options: {
      type: [String],
      default: undefined,
    },
  },
  { _id: false },
);

export const DEFAULT_FEEDBACK_QUESTIONS = [
  {
    id: 'overall_experience',
    label: 'What did you enjoy most about your visit?',
    type: 'text' as const,
    required: false,
  },
  {
    id: 'service_quality',
    label: 'How was the service speed and attentiveness?',
    type: 'single_choice' as const,
    required: false,
    options: ['Excellent', 'Good', 'Average', 'Needs Improvement'],
  },
];

const businessSettingsSchema = new Schema(
  {
    allowPublicReviews: {
      type: Boolean,
      default: true,
    },
    notificationEmail: {
      type: String,
      lowercase: true,
      trim: true,
      match: [EMAIL_REGEX, 'Please provide a valid notification email address'],
      default: null,
    },
    defaultLanguage: {
      type: String,
      enum: ['en'],
      default: 'en',
    },
    headingText: {
      type: String,
      trim: true,
      maxlength: [120, 'Heading text cannot exceed 120 characters'],
      default: null,
    },
    subheadingText: {
      type: String,
      trim: true,
      maxlength: [250, 'Subheading text cannot exceed 250 characters'],
      default: null,
    },
    feedbackQuestions: {
      type: [feedbackQuestionSchema],
      default: () => DEFAULT_FEEDBACK_QUESTIONS,
    },
  },
  { _id: false },
);

const businessSchema = new Schema<IBusinessDocument>(
  {
    name: {
      type: String,
      required: [true, 'Business name is required'],
      trim: true,
      minlength: [2, 'Business name must be at least 2 characters long'],
      maxlength: [120, 'Business name cannot exceed 120 characters'],
      index: true,
    },
    category: {
      type: String,
      required: [true, 'Business category is required'],
      trim: true,
      maxlength: [80, 'Category cannot exceed 80 characters'],
      index: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Business must have an assigned owner'],
      unique: true, // One business per user account in initial phase
      index: true,
    },
    googleReviewUrl: {
      type: String,
      trim: true,
      default: null,
    },
    googlePlaceId: {
      type: String,
      trim: true,
      default: null,
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'suspended', 'pending_verification'],
        message: "Status '{VALUE}' is not supported",
      },
      default: 'active',
      index: true,
    },
    branding: {
      type: businessBrandingSchema,
      default: () => ({}),
    },
    settings: {
      type: businessSettingsSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    strict: true,
    toJSON: {
      transform(_doc, ret) {
        delete (ret as Record<string, unknown>).__v;
        return ret;
      },
    },
  },
);

// Compound indexes for administrative searches and multi-tenant queries
businessSchema.index({ status: 1, createdAt: -1 });
businessSchema.index({ category: 1, status: 1 });

export const Business: Model<IBusinessDocument> = model<IBusinessDocument>(
  'Business',
  businessSchema,
);
