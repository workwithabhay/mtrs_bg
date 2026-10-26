import { Schema, model, type Model, type Document, type Types } from 'mongoose';

const HEX_COLOR_REGEX = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

export type QrCampaignStatus = 'active' | 'inactive';

export interface IQrCampaignBranding {
  primaryColor: string;
  backgroundColor: string;
  logoKey?: string | null;
  logoUrl?: string | null;
}

export interface IQrCampaign {
  businessId: Types.ObjectId;
  title: string;
  heading: string;
  description?: string | null;
  branding: IQrCampaignBranding;
  status: QrCampaignStatus;
  publicToken: string;
  scanCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IQrCampaignDocument extends IQrCampaign, Document<Types.ObjectId> {}

const qrCampaignBrandingSchema = new Schema(
  {
    primaryColor: {
      type: String,
      default: '#2563EB',
      match: [HEX_COLOR_REGEX, 'Primary color must be a valid hex color code (e.g. #2563EB)'],
    },
    backgroundColor: {
      type: String,
      default: '#FFFFFF',
      match: [HEX_COLOR_REGEX, 'Background color must be a valid hex color code (e.g. #FFFFFF)'],
    },
    logoKey: {
      type: String,
      default: null,
    },
    logoUrl: {
      type: String,
      default: null,
    },
  },
  { _id: false },
);

const qrCampaignSchema = new Schema<IQrCampaignDocument>(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Campaign title is required'],
      trim: true,
      minlength: [2, 'Title must be at least 2 characters long'],
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    heading: {
      type: String,
      required: [true, 'Landing page heading is required'],
      trim: true,
      minlength: [2, 'Heading must be at least 2 characters long'],
      maxlength: [120, 'Heading cannot exceed 120 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [250, 'Description cannot exceed 250 characters'],
      default: null,
    },
    branding: {
      type: qrCampaignBrandingSchema,
      default: () => ({}),
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    publicToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    scanCount: {
      type: Number,
      default: 0,
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

// Compound index for tenant-scoped active campaign queries
qrCampaignSchema.index({ businessId: 1, status: 1, createdAt: -1 });

export const QrCampaign: Model<IQrCampaignDocument> = model<IQrCampaignDocument>(
  'QrCampaign',
  qrCampaignSchema,
);
