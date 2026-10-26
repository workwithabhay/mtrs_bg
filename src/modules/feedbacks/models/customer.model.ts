import { Schema, model, type Model, type Document, type Types } from 'mongoose';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ICustomer {
  businessId: Types.ObjectId;
  name: string;
  email?: string | null;
  phone?: string | null;
  lastVisitedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICustomerDocument extends ICustomer, Document<Types.ObjectId> {}

const customerSchema = new Schema<ICustomerDocument>(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
      minlength: [2, 'Customer name must be at least 2 characters long'],
      maxlength: [100, 'Customer name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      match: [EMAIL_REGEX, 'Please provide a valid email address'],
      default: null,
    },
    phone: {
      type: String,
      trim: true,
      default: null,
    },
    lastVisitedAt: {
      type: Date,
      default: () => new Date(),
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

// Compound indexes for fast customer lookups per business tenant
customerSchema.index({ businessId: 1, email: 1 });
customerSchema.index({ businessId: 1, phone: 1 });
customerSchema.index({ businessId: 1, createdAt: -1 });

export const Customer: Model<ICustomerDocument> = model<ICustomerDocument>(
  'Customer',
  customerSchema,
);
