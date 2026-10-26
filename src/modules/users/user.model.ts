import { Schema, model, type Model } from 'mongoose';
import type { IUserDocument } from './user.types.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const userSchema = new Schema<IUserDocument>(
  {
    name: {
      type: String,
      required: [true, 'User name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters long'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [EMAIL_REGEX, 'Please provide a valid email address'],
      index: true,
    },
    role: {
      type: String,
      enum: {
        values: ['business_owner', 'super_admin'],
        message: "Role '{VALUE}' is not supported",
      },
      default: 'business_owner',
      index: true,
    },
    status: {
      type: String,
      enum: {
        values: ['pending', 'active', 'suspended'],
        message: "Status '{VALUE}' is not supported",
      },
      default: 'pending',
      index: true,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
      index: true,
    },
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      default: null,
      index: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
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

// Compound indexes for administrative and tenant-scoped lookups
userSchema.index({ role: 1, status: 1 });
userSchema.index({ email: 1, isEmailVerified: 1 });

export const User: Model<IUserDocument> = model<IUserDocument>('User', userSchema);
