import { Schema, model, type Model } from 'mongoose';
import type { IPlanDocument } from '../billing.types.js';

const planLimitsSchema = new Schema(
  {
    maxCampaigns: { type: Number, required: true, default: 10 },
    maxMonthlyScans: { type: Number, required: true, default: 1000 },
    aiAssistanceEnabled: { type: Boolean, required: true, default: true },
  },
  { _id: false },
);

const planSchema = new Schema<IPlanDocument>(
  {
    planId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    }, // Stored in minor units (integer paise / cents)
    currency: {
      type: String,
      required: true,
      uppercase: true,
      default: 'INR',
      trim: true,
    },
    interval: {
      type: String,
      enum: ['monthly', 'five_month', 'yearly', 'package'],
      required: true,
      default: 'monthly',
    },
    isPublished: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
    features: {
      type: [String],
      required: true,
      default: [],
    },
    limits: {
      type: planLimitsSchema,
      required: true,
    },
    sortOrder: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

planSchema.index({ isPublished: 1, sortOrder: 1 });

export const Plan: Model<IPlanDocument> = model<IPlanDocument>('Plan', planSchema);

export const DEFAULT_PLANS = [
  // Commercial Plan A: Monthly
  {
    planId: 'monthly',
    name: 'Monthly Plan',
    description: 'Full monthly access to ReviewFlow review generation, QR campaigns, and AI tools.',
    price: 9900, // ₹99.00 INR (9900 paise)
    currency: 'INR',
    interval: 'monthly' as const,
    isPublished: true,
    features: [
      'Unlimited QR Campaigns',
      'Unlimited customer scans & feedback',
      'Direct Google Review redirection',
      'Private negative feedback capture',
      'AI Feedback Clarity Assistance',
      'Owner analytics & CSV export',
    ],
    limits: {
      maxCampaigns: 50,
      maxMonthlyScans: 50000,
      aiAssistanceEnabled: true,
    },
    sortOrder: 1,
  },
  // Commercial Plan B: Five-Month Package
  {
    planId: 'five_month',
    name: 'Five-Month Package',
    description: 'Prepaid 5 calendar months of full access at a discounted rate.',
    price: 39900, // ₹399.00 INR (39900 paise)
    currency: 'INR',
    interval: 'five_month' as const,
    isPublished: true,
    features: [
      '5 Calendar Months prepaid access',
      'Unlimited QR Campaigns',
      'Unlimited customer scans & feedback',
      'Direct Google Review redirection',
      'Private negative feedback capture',
      'AI Feedback Clarity Assistance',
      'Owner analytics & CSV export',
      'Priority email support',
    ],
    limits: {
      maxCampaigns: 100,
      maxMonthlyScans: 100000,
      aiAssistanceEnabled: true,
    },
    sortOrder: 2,
  },
  // Commercial Plan C: FREE4YOU Promotional Lifetime Access
  {
    planId: 'free4you',
    name: 'Lifetime Free Access (FREE4YOU)',
    description: 'Exclusive lifetime-free access unlocked via promotional code.',
    price: 0,
    currency: 'INR',
    interval: 'monthly' as const,
    isPublished: false, // Internal entitlement unlocked via promo code
    features: [
      'Lifetime Free Access',
      'Unlimited QR Campaigns',
      'Unlimited customer scans & feedback',
      'Direct Google Review redirection',
      'Private negative feedback capture',
      'AI Feedback Clarity Assistance',
      'Owner analytics & CSV export',
    ],
    limits: {
      maxCampaigns: 100,
      maxMonthlyScans: 100000,
      aiAssistanceEnabled: true,
    },
    sortOrder: 3,
  },
  // Seven-Day Free Trial
  {
    planId: 'trial',
    name: '7-Day Free Trial',
    description: 'Seven-day full access trial for newly created accounts.',
    price: 0,
    currency: 'INR',
    interval: 'monthly' as const,
    isPublished: false,
    features: [
      '7-day full access trial',
      'QR campaigns and customer feedback',
      'Direct Google Review redirection',
      'Private feedback capture',
    ],
    limits: {
      maxCampaigns: 10,
      maxMonthlyScans: 1000,
      aiAssistanceEnabled: true,
    },
    sortOrder: 0,
  },
  // Backwards compatibility for legacy dev/test plans
  {
    planId: 'free',
    name: 'Free Trial',
    description: 'Get started with basic customer reviews and QR collection.',
    price: 0,
    currency: 'INR',
    interval: 'monthly' as const,
    isPublished: false,
    features: [
      '1 QR Campaign',
      'Up to 100 monthly scans',
      'Direct Google Review redirection',
      'Private negative feedback capture',
    ],
    limits: {
      maxCampaigns: 1,
      maxMonthlyScans: 100,
      aiAssistanceEnabled: false,
    },
    sortOrder: 98,
  },
  {
    planId: 'starter',
    name: 'Starter',
    description: 'Legacy starter plan.',
    price: 99900,
    currency: 'INR',
    interval: 'monthly' as const,
    isPublished: false,
    features: ['5 QR Campaigns', 'AI Feedback Clarity Assistance'],
    limits: {
      maxCampaigns: 5,
      maxMonthlyScans: 1000,
      aiAssistanceEnabled: true,
    },
    sortOrder: 99,
  },
];

export async function seedDefaultPlans(): Promise<void> {
  for (const planData of DEFAULT_PLANS) {
    await Plan.updateOne({ planId: planData.planId }, { $set: planData }, { upsert: true });
  }
}
