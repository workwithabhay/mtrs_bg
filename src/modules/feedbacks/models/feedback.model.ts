import { Schema, model, type Model, type Document, type Types } from 'mongoose';

export type FeedbackStatus = 'new' | 'reviewed' | 'resolved';

export interface IFeedbackAnswer {
  questionId: string;
  questionLabel: string;
  answer: string;
}

export interface IFeedback {
  businessId: Types.ObjectId;
  qrCampaignId: Types.ObjectId;
  customerId: Types.ObjectId;
  rating: number; // 1-5
  text?: string | null;
  answers: IFeedbackAnswer[];
  status: FeedbackStatus;
  consentAccepted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IFeedbackDocument extends IFeedback, Document<Types.ObjectId> {}

const feedbackAnswerSchema = new Schema<IFeedbackAnswer>(
  {
    questionId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    questionLabel: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    answer: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
  },
  { _id: false },
);

const feedbackSchema = new Schema<IFeedbackDocument>(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    qrCampaignId: {
      type: Schema.Types.ObjectId,
      ref: 'QrCampaign',
      required: true,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating cannot exceed 5'],
      index: true,
    },
    text: {
      type: String,
      trim: true,
      maxlength: [2000, 'Feedback text cannot exceed 2000 characters'],
      default: null,
    },
    answers: {
      type: [feedbackAnswerSchema],
      default: () => [],
    },
    status: {
      type: String,
      enum: ['new', 'reviewed', 'resolved'],
      default: 'new',
      index: true,
    },
    consentAccepted: {
      type: Boolean,
      required: [true, 'Consent acknowledgment is required'],
      validate: {
        validator: (v: boolean) => v === true,
        message: 'Consent must be accepted to submit feedback',
      },
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

// Compound indexes for tenant-scoped querying, filtering, and stable sorting
feedbackSchema.index({ businessId: 1, createdAt: -1 });
feedbackSchema.index({ businessId: 1, status: 1, createdAt: -1 });
feedbackSchema.index({ businessId: 1, rating: 1 });
feedbackSchema.index({ businessId: 1, createdAt: -1, rating: 1 });
feedbackSchema.index({ qrCampaignId: 1, createdAt: -1 });

export const Feedback: Model<IFeedbackDocument> = model<IFeedbackDocument>(
  'Feedback',
  feedbackSchema,
);
