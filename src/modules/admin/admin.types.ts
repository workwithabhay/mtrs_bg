import type { Types, Document } from 'mongoose';
import type { BusinessStatus } from '../businesses/business.types.js';
import type { SubscriptionStatus, PlanInterval, IPlanLimits } from '../billing/billing.types.js';

export interface IAuditLog {
  actorId: Types.ObjectId;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAuditLogDocument extends IAuditLog, Document {}

export interface AdminPlatformOverview {
  businesses: {
    total: number;
    active: number;
    suspended: number;
    pending: number;
  };
  users: {
    total: number;
    businessOwners: number;
    superAdmins: number;
  };
  subscriptions: {
    total: number;
    active: number;
    pending: number;
    cancelled: number;
    expired: number;
  };
  revenue: {
    totalAmountMinor: number;
    currency: string;
    successfulTransactionsCount: number;
    isSimulated: boolean;
    note: string;
  };
  recentActivity: Array<{
    id: string;
    action: string;
    actorEmail: string;
    targetType: string;
    targetId?: string | null;
    createdAt: Date;
  }>;
}

export interface AdminBusinessListItem {
  id: string;
  name: string;
  category: string;
  status: BusinessStatus;
  owner: {
    id: string;
    name: string;
    email: string;
  } | null;
  subscriptionSummary: {
    planId: string;
    status: SubscriptionStatus;
    billingInterval: PlanInterval;
    currentPeriodEnd?: Date | null;
  } | null;
  createdAt: Date;
}

export interface AdminBusinessDetail extends AdminBusinessListItem {
  googleReviewUrl?: string | null;
  googlePlaceId?: string | null;
  branding: {
    primaryColor: string;
    secondaryColor: string;
    logoUrl?: string | null;
  };
  stats: {
    campaignsCount: number;
    feedbacksCount: number;
  };
}

export interface AdminSubscriptionListItem {
  id: string;
  businessId: string;
  businessName?: string;
  planId: string;
  planName?: string;
  status: SubscriptionStatus;
  billingInterval: PlanInterval;
  priceSnapshot: {
    amount: number;
    currency: string;
  };
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  cancelledAt?: Date | null;
  createdAt: Date;
}

export interface CreatePlanInput {
  planId: string;
  name: string;
  description: string;
  price: number;
  currency?: string;
  interval: PlanInterval;
  isPublished?: boolean;
  features: string[];
  limits: IPlanLimits;
  sortOrder?: number;
}

export interface UpdatePlanInput {
  name?: string;
  description?: string;
  price?: number;
  currency?: string;
  interval?: PlanInterval;
  isPublished?: boolean;
  features?: string[];
  limits?: Partial<IPlanLimits>;
  sortOrder?: number;
}

export interface AdminPaymentListItem {
  id: string;
  businessId: string;
  businessName?: string;
  provider: string;
  eventType: string;
  status: 'pending' | 'success' | 'failed';
  amount: number;
  currency: string;
  paymentReference?: string | null;
  checkoutId?: string | null;
  isSimulated: boolean;
  createdAt: Date;
}

export interface AdminWebhookListItem {
  id: string;
  provider: string;
  eventId: string;
  eventType: string;
  processed: boolean;
  processedAt?: Date | null;
  error?: string | null;
  createdAt: Date;
}

export interface AdminPromotionDetail {
  code: string;
  name: string;
  description?: string;
  status: 'active' | 'paused' | 'retired';
  pausedAt?: Date | null;
  retiredAt?: Date | null;
  migrationDeadline?: Date | null;
  gracePeriodDays: number;
  retirementReason?: string | null;
  redeemedCount: number;
  activeEntitlementsCount: number;
  createdAt: Date;
}

export interface AdminOperationsSummary {
  provider: string;
  isSimulated: boolean;
  totalWebhooks: number;
  processedWebhooks: number;
  failedWebhooks: number;
  failedPaymentsCount: number;
  pendingPaymentsCount: number;
}

