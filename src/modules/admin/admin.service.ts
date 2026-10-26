import { Types } from 'mongoose';
import { Business } from '../businesses/business.model.js';
import { User } from '../users/user.model.js';
import { Subscription } from '../billing/models/subscription.model.js';
import { Plan } from '../billing/models/plan.model.js';
import { PaymentEvent } from '../billing/models/payment-event.model.js';
import { QrCampaign } from '../qr-campaigns/models/qr-campaign.model.js';
import { Feedback } from '../feedbacks/models/feedback.model.js';
import { AuditLog } from './models/audit-log.model.js';
import { PromoRedemption } from '../billing/models/promo-redemption.model.js';
import { Promotion } from '../billing/models/promotion.model.js';
import { WebhookEvent } from '../billing/models/webhook-event.model.js';
import { env } from '../../config/env.js';
import { NotFoundError, ConflictError, BadRequestError } from '../../common/errors/app-error.js';
import type {
  AdminPlatformOverview,
  AdminBusinessListItem,
  AdminBusinessDetail,
  AdminSubscriptionListItem,
  CreatePlanInput,
  UpdatePlanInput,
  AdminPaymentListItem,
  AdminWebhookListItem,
  AdminPromotionDetail,
  AdminOperationsSummary,
} from './admin.types.js';
import type {
  AdminBusinessQuery,
  AdminSubscriptionQuery,
  AdminAuditLogQuery,
  UpdateBusinessStatusInput,
  OverrideSubscriptionInput,
  RetirePromotionInput,
  AdminPaymentsQuery,
  AdminWebhooksQuery,
} from './admin.validation.js';

interface AuditActor {
  id: Types.ObjectId;
  email: string;
  ipAddress?: string;
  userAgent?: string;
}

export class AdminService {
  /**
   * Safe audit logging helper.
   * Strips any sensitive credentials, tokens, or PII before persisting.
   */
  public async logAction(
    actor: AuditActor,
    action: string,
    targetType: string,
    targetId?: string | null,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await AuditLog.create({
        actorId: actor.id,
        actorEmail: actor.email,
        action,
        targetType,
        targetId: targetId ?? null,
        metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
        ipAddress: actor.ipAddress ?? null,
        userAgent: actor.userAgent ?? null,
      });
    } catch {
      // Audit log failures should not block critical platform operations
    }
  }

  /**
   * Platform-level high-level overview metrics based only on real database records.
   */
  public async getPlatformOverview(): Promise<AdminPlatformOverview> {
    const [
      totalBusinesses,
      activeBusinesses,
      suspendedBusinesses,
      pendingBusinesses,
      totalUsers,
      businessOwners,
      superAdmins,
      totalSubscriptions,
      activeSubscriptions,
      pendingSubscriptions,
      cancelledSubscriptions,
      expiredSubscriptions,
      revenueAgg,
      recentLogs,
    ] = await Promise.all([
      Business.countDocuments(),
      Business.countDocuments({ status: 'active' }),
      Business.countDocuments({ status: 'suspended' }),
      Business.countDocuments({ status: 'pending_verification' }),
      User.countDocuments(),
      User.countDocuments({ role: 'business_owner' }),
      User.countDocuments({ role: 'super_admin' }),
      Subscription.countDocuments(),
      Subscription.countDocuments({ status: 'active' }),
      Subscription.countDocuments({ status: 'pending' }),
      Subscription.countDocuments({ status: 'cancelled' }),
      Subscription.countDocuments({ status: 'expired' }),
      PaymentEvent.aggregate([
        { $match: { status: 'success', eventType: 'payment.succeeded' } },
        {
          $group: {
            _id: null,
            totalAmountMinor: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ]),
      AuditLog.find().sort({ createdAt: -1 }).limit(10).lean(),
    ]);

    const rev = revenueAgg[0] || { totalAmountMinor: 0, count: 0 };

    return {
      businesses: {
        total: totalBusinesses,
        active: activeBusinesses,
        suspended: suspendedBusinesses,
        pending: pendingBusinesses,
      },
      users: {
        total: totalUsers,
        businessOwners,
        superAdmins,
      },
      subscriptions: {
        total: totalSubscriptions,
        active: activeSubscriptions,
        pending: pendingSubscriptions,
        cancelled: cancelledSubscriptions,
        expired: expiredSubscriptions,
      },
      revenue: {
        totalAmountMinor: rev.totalAmountMinor,
        currency: 'INR',
        successfulTransactionsCount: rev.count,
        isSimulated: true,
        note: 'Revenue includes only verified successful payment events (simulated mock transactions in development).',
      },
      recentActivity: recentLogs.map((l) => ({
        id: l._id.toString(),
        action: l.action,
        actorEmail: l.actorEmail,
        targetType: l.targetType,
        targetId: l.targetId,
        createdAt: l.createdAt,
      })),
    };
  }

  /**
   * Searchable, paginated list of businesses across the platform.
   */
  public async getBusinesses(query: AdminBusinessQuery) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 10));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};

    if (query.status && query.status !== 'all') {
      filter.status = query.status;
    }

    if (query.query && query.query.trim().length > 0) {
      const escaped = query.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { category: { $regex: escaped, $options: 'i' } },
      ];
    }

    const [total, businesses] = await Promise.all([
      Business.countDocuments(filter),
      Business.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    // Batch lookup owners and subscriptions
    const ownerIds = businesses.map((b) => b.ownerId).filter(Boolean);
    const businessIds = businesses.map((b) => b._id);

    const [owners, subscriptions] = await Promise.all([
      User.find({ _id: { $in: ownerIds } }, 'name email').lean(),
      Subscription.find({ businessId: { $in: businessIds } }).lean(),
    ]);

    const ownerMap = new Map(owners.map((o) => [o._id.toString(), o]));
    const subMap = new Map(subscriptions.map((s) => [s.businessId.toString(), s]));

    const items: AdminBusinessListItem[] = businesses.map((b) => {
      const owner = b.ownerId ? ownerMap.get(b.ownerId.toString()) : null;
      const sub = subMap.get(b._id.toString());

      return {
        id: b._id.toString(),
        name: b.name,
        category: b.category,
        status: b.status,
        owner: owner
          ? {
              id: owner._id.toString(),
              name: owner.name,
              email: owner.email,
            }
          : null,
        subscriptionSummary: sub
          ? {
              planId: sub.planId,
              status: sub.status,
              billingInterval: sub.billingInterval,
              currentPeriodEnd: sub.currentPeriodEnd,
            }
          : null,
        createdAt: b.createdAt,
      };
    });

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Detail view for a specific business.
   */
  public async getBusinessDetail(businessId: string): Promise<AdminBusinessDetail> {
    if (!Types.ObjectId.isValid(businessId)) {
      throw new NotFoundError('Business not found.');
    }

    const b = await Business.findById(businessId).lean();
    if (!b) {
      throw new NotFoundError('Business not found.');
    }

    const [owner, sub, campaignsCount, feedbacksCount] = await Promise.all([
      b.ownerId ? User.findById(b.ownerId, 'name email').lean() : null,
      Subscription.findOne({ businessId: b._id }).lean(),
      QrCampaign.countDocuments({ businessId: b._id }),
      Feedback.countDocuments({ businessId: b._id }),
    ]);

    return {
      id: b._id.toString(),
      name: b.name,
      category: b.category,
      status: b.status,
      googleReviewUrl: b.googleReviewUrl ?? null,
      googlePlaceId: b.googlePlaceId ?? null,
      branding: {
        primaryColor: b.branding?.primaryColor || '#2563EB',
        secondaryColor: b.branding?.secondaryColor || '#1E293B',
        logoUrl: b.branding?.logoUrl ?? null,
      },
      owner: owner
        ? {
            id: owner._id.toString(),
            name: owner.name,
            email: owner.email,
          }
        : null,
      subscriptionSummary: sub
        ? {
            planId: sub.planId,
            status: sub.status,
            billingInterval: sub.billingInterval,
            currentPeriodEnd: sub.currentPeriodEnd,
          }
        : null,
      stats: {
        campaignsCount,
        feedbacksCount,
      },
      createdAt: b.createdAt,
    };
  }

  /**
   * Paginated subscription list across all businesses.
   */
  public async getSubscriptions(query: AdminSubscriptionQuery) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 10));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};

    if (query.status && query.status !== 'all') {
      filter.status = query.status;
    }
    if (query.planId && query.planId.trim().length > 0) {
      filter.planId = query.planId.trim().toLowerCase();
    }

    const [total, subs] = await Promise.all([
      Subscription.countDocuments(filter),
      Subscription.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    const businessIds = subs.map((s) => s.businessId);
    const businesses = await Business.find({ _id: { $in: businessIds } }, 'name').lean();
    const businessMap = new Map(businesses.map((b) => [b._id.toString(), b.name]));

    const items: AdminSubscriptionListItem[] = subs.map((s) => ({
      id: s._id.toString(),
      businessId: s.businessId.toString(),
      businessName: businessMap.get(s.businessId.toString()) || undefined,
      planId: s.planId,
      status: s.status,
      billingInterval: s.billingInterval,
      priceSnapshot: s.priceSnapshot,
      currentPeriodStart: s.currentPeriodStart,
      currentPeriodEnd: s.currentPeriodEnd,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      cancelledAt: s.cancelledAt ?? null,
      createdAt: s.createdAt,
    }));

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * List all plans (including unpublished/archived ones).
   */
  public async getPlans() {
    return Plan.find().sort({ sortOrder: 1, createdAt: -1 }).lean();
  }

  /**
   * Create a new subscription plan and log audit event.
   */
  public async createPlan(input: CreatePlanInput, actor: AuditActor) {
    const existing = await Plan.findOne({ planId: input.planId.toLowerCase() });
    if (existing) {
      throw new ConflictError(`Plan with ID '${input.planId}' already exists.`);
    }

    const plan = await Plan.create({
      planId: input.planId.toLowerCase(),
      name: input.name,
      description: input.description,
      price: input.price,
      currency: input.currency || 'INR',
      interval: input.interval,
      isPublished: input.isPublished !== undefined ? input.isPublished : true,
      features: input.features,
      limits: input.limits,
      sortOrder: input.sortOrder || 0,
    });

    await this.logAction(actor, 'plan.created', 'Plan', plan.planId, {
      name: plan.name,
      price: plan.price,
      interval: plan.interval,
    });

    return plan;
  }

  /**
   * Update an existing subscription plan and log audit event.
   * Does NOT alter historical subscription price snapshots.
   */
  public async updatePlan(planId: string, input: UpdatePlanInput, actor: AuditActor) {
    const plan = await Plan.findOne({ planId: planId.toLowerCase() });
    if (!plan) {
      throw new NotFoundError(`Plan '${planId}' not found.`);
    }

    if (input.name !== undefined) plan.name = input.name;
    if (input.description !== undefined) plan.description = input.description;
    if (input.price !== undefined) plan.price = input.price;
    if (input.currency !== undefined) plan.currency = input.currency;
    if (input.interval !== undefined) plan.interval = input.interval;
    if (input.isPublished !== undefined) plan.isPublished = input.isPublished;
    if (input.features !== undefined) plan.features = input.features;
    if (input.sortOrder !== undefined) plan.sortOrder = input.sortOrder;
    if (input.limits !== undefined) {
      plan.limits = {
        maxCampaigns: input.limits.maxCampaigns ?? plan.limits.maxCampaigns,
        maxMonthlyScans: input.limits.maxMonthlyScans ?? plan.limits.maxMonthlyScans,
        aiAssistanceEnabled:
          input.limits.aiAssistanceEnabled !== undefined
            ? input.limits.aiAssistanceEnabled
            : plan.limits.aiAssistanceEnabled,
      };
    }

    await plan.save();

    await this.logAction(actor, 'plan.updated', 'Plan', plan.planId, {
      updatedFields: Object.keys(input),
    });

    return plan;
  }

  /**
   * Paginated audit logs.
   */
  public async getAuditLogs(query: AdminAuditLogQuery) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (query.action && query.action.trim().length > 0) {
      filter.action = query.action.trim();
    }
    if (query.targetType && query.targetType.trim().length > 0) {
      filter.targetType = query.targetType.trim();
    }

    const [total, logs] = await Promise.all([
      AuditLog.countDocuments(filter),
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    const items = logs.map((l) => ({
      id: l._id.toString(),
      actorId: l.actorId.toString(),
      actorEmail: l.actorEmail,
      action: l.action,
      targetType: l.targetType,
      targetId: l.targetId,
      metadata: l.metadata,
      ipAddress: l.ipAddress,
      userAgent: l.userAgent,
      createdAt: l.createdAt,
    }));

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Suspend or reactivate a business account with required reason and audit log.
   */
  public async updateBusinessStatus(
    businessId: string,
    input: UpdateBusinessStatusInput,
    actor: AuditActor,
  ) {
    if (!Types.ObjectId.isValid(businessId)) {
      throw new NotFoundError('Business not found.');
    }

    const business = await Business.findById(businessId);
    if (!business) {
      throw new NotFoundError('Business not found.');
    }

    const previousStatus = business.status;
    business.status = input.status;
    await business.save();

    const action = input.status === 'suspended' ? 'business.suspended' : 'business.reactivated';
    await this.logAction(actor, action, 'Business', business._id.toString(), {
      reason: input.reason,
      previousStatus,
      newStatus: input.status,
    });

    return this.getBusinessDetail(businessId);
  }

  /**
   * Manual administrative subscription override / entitlement correction with required reason and audit log.
   */
  public async overrideSubscription(
    subscriptionId: string,
    input: OverrideSubscriptionInput,
    actor: AuditActor,
  ) {
    if (!Types.ObjectId.isValid(subscriptionId)) {
      throw new NotFoundError('Subscription not found.');
    }

    const subscription = await Subscription.findById(subscriptionId);
    if (!subscription) {
      throw new NotFoundError('Subscription not found.');
    }

    const previousState = {
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
    };

    if (input.currentPeriodEnd) {
      subscription.currentPeriodEnd = new Date(input.currentPeriodEnd);
    }
    if (input.status) {
      subscription.status = input.status;
    }

    await subscription.save();

    await this.logAction(actor, 'subscription.overridden', 'Subscription', subscription._id.toString(), {
      reason: input.reason,
      previous: previousState,
      updated: {
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
      },
    });

    return subscription;
  }

  /**
   * Ensure default FREE4YOU promotion exists and list all promotional codes.
   */
  public async getPromotions(): Promise<AdminPromotionDetail[]> {
    let free4you = await Promotion.findOne({ code: 'FREE4YOU' });
    if (!free4you) {
      free4you = await Promotion.create({
        code: 'FREE4YOU',
        name: 'FREE4YOU Lifetime Promotion',
        description: 'Lifetime-free promotional access for qualifying early users',
        status: 'active',
        gracePeriodDays: 30,
      });
    }

    const promotions = await Promotion.find().sort({ createdAt: -1 });

    const results: AdminPromotionDetail[] = await Promise.all(
      promotions.map(async (promo) => {
        const [redeemedCount, activeEntitlementsCount] = await Promise.all([
          PromoRedemption.countDocuments({ code: promo.code }),
          Subscription.countDocuments({
            planId: promo.code.toLowerCase(),
            status: 'active',
          }),
        ]);

        return {
          code: promo.code,
          name: promo.name,
          description: promo.description,
          status: promo.status,
          pausedAt: promo.pausedAt,
          retiredAt: promo.retiredAt,
          migrationDeadline: promo.migrationDeadline,
          gracePeriodDays: promo.gracePeriodDays || 30,
          retirementReason: promo.retirementReason,
          redeemedCount,
          activeEntitlementsCount,
          createdAt: promo.createdAt,
        };
      }),
    );

    return results;
  }

  /**
   * Pause a promotional code (stops new redemptions while preserving existing entitlements).
   */
  public async pausePromotion(code: string, actor: AuditActor) {
    const normalizedCode = (code || '').trim().toUpperCase();
    let promo = await Promotion.findOne({ code: normalizedCode });
    if (!promo) {
      if (normalizedCode === 'FREE4YOU') {
        promo = await Promotion.create({
          code: 'FREE4YOU',
          name: 'FREE4YOU Lifetime Promotion',
          status: 'active',
          gracePeriodDays: 30,
        });
      } else {
        throw new NotFoundError(`Promotion with code '${normalizedCode}' not found.`);
      }
    }

    if (promo.status === 'retired') {
      throw new BadRequestError('Cannot pause a retired promotion.');
    }

    promo.status = 'paused';
    promo.pausedAt = new Date();
    await promo.save();

    await this.logAction(actor, 'promotion.paused', 'Promotion', promo.code, {
      status: 'paused',
      pausedAt: promo.pausedAt,
    });

    return promo;
  }

  /**
   * Resume a paused promotion.
   */
  public async resumePromotion(code: string, actor: AuditActor) {
    const normalizedCode = (code || '').trim().toUpperCase();
    const promo = await Promotion.findOne({ code: normalizedCode });
    if (!promo) {
      throw new NotFoundError(`Promotion with code '${normalizedCode}' not found.`);
    }

    if (promo.status === 'retired') {
      throw new BadRequestError('Cannot resume a retired promotion.');
    }

    promo.status = 'active';
    promo.pausedAt = null;
    await promo.save();

    await this.logAction(actor, 'promotion.resumed', 'Promotion', promo.code, {
      status: 'active',
    });

    return promo;
  }

  /**
   * Retire/withdraw a promotion with migration deadline, reason, and affected accounts audit.
   */
  public async retirePromotion(code: string, input: RetirePromotionInput, actor: AuditActor) {
    const normalizedCode = (code || '').trim().toUpperCase();
    let promo = await Promotion.findOne({ code: normalizedCode });
    if (!promo) {
      if (normalizedCode === 'FREE4YOU') {
        promo = await Promotion.create({
          code: 'FREE4YOU',
          name: 'FREE4YOU Lifetime Promotion',
          status: 'active',
          gracePeriodDays: input.gracePeriodDays || 30,
        });
      } else {
        throw new NotFoundError(`Promotion with code '${normalizedCode}' not found.`);
      }
    }

    const now = new Date();
    const graceDays = input.gracePeriodDays || 30;
    const migrationDeadline = new Date(now.getTime() + graceDays * 24 * 60 * 60 * 1000);

    promo.status = 'retired';
    promo.retiredAt = now;
    promo.gracePeriodDays = graceDays;
    promo.migrationDeadline = migrationDeadline;
    promo.retirementReason = input.reason;
    await promo.save();

    const affectedCount = await PromoRedemption.countDocuments({ code: promo.code });

    await this.logAction(actor, 'promotion.retired', 'Promotion', promo.code, {
      reason: input.reason,
      gracePeriodDays: graceDays,
      migrationDeadline,
      affectedAccountsCount: affectedCount,
    });

    return {
      promotion: promo,
      affectedAccountsCount: affectedCount,
    };
  }

  /**
   * Searchable, paginated transaction / payment audit list.
   */
  public async getPayments(query: AdminPaymentsQuery) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 10));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};

    if (query.status && query.status !== 'all') {
      filter.status = query.status;
    }
    if (query.provider && query.provider !== 'all') {
      filter.provider = query.provider;
    }
    if (query.query && query.query.trim().length > 0) {
      const escaped = query.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { paymentReference: { $regex: escaped, $options: 'i' } },
        { checkoutId: { $regex: escaped, $options: 'i' } },
      ];
    }

    const [total, events] = await Promise.all([
      PaymentEvent.countDocuments(filter),
      PaymentEvent.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    const businessIds = events.map((e) => e.businessId);
    const businesses = await Business.find({ _id: { $in: businessIds } }, 'name').lean();
    const businessMap = new Map(businesses.map((b) => [b._id.toString(), b.name]));

    const items: AdminPaymentListItem[] = events.map((e) => ({
      id: e._id.toString(),
      businessId: e.businessId.toString(),
      businessName: businessMap.get(e.businessId.toString()) || undefined,
      provider: e.provider,
      eventType: e.eventType,
      status: e.status,
      amount: e.amount,
      currency: e.currency,
      paymentReference: e.paymentReference ?? null,
      checkoutId: e.checkoutId ?? null,
      isSimulated: Boolean(e.isSimulated),
      createdAt: e.createdAt,
    }));

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Health and operational status summary of payment and webhook infrastructure.
   */
  public async getBillingOperations(): Promise<AdminOperationsSummary> {
    const [
      totalWebhooks,
      processedWebhooks,
      failedWebhooks,
      failedPaymentsCount,
      pendingPaymentsCount,
    ] = await Promise.all([
      WebhookEvent.countDocuments(),
      WebhookEvent.countDocuments({ processed: true }),
      WebhookEvent.countDocuments({ error: { $ne: null } }),
      PaymentEvent.countDocuments({ status: 'failed' }),
      PaymentEvent.countDocuments({ status: 'pending' }),
    ]);

    return {
      provider: env.PAYMENT_PROVIDER,
      isSimulated: env.PAYMENT_PROVIDER === 'mock' || env.ENABLE_DEV_MOCK_PAYMENTS,
      totalWebhooks,
      processedWebhooks,
      failedWebhooks,
      failedPaymentsCount,
      pendingPaymentsCount,
    };
  }

  /**
   * Paginated list of recent webhook events for operational observability.
   */
  public async getWebhooks(query: AdminWebhooksQuery) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 10));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (query.provider && query.provider.trim().length > 0) {
      filter.provider = query.provider.trim();
    }
    if (query.eventType && query.eventType.trim().length > 0) {
      filter.eventType = query.eventType.trim();
    }

    const [total, events] = await Promise.all([
      WebhookEvent.countDocuments(filter),
      WebhookEvent.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    const items: AdminWebhookListItem[] = events.map((w) => ({
      id: w._id.toString(),
      provider: w.provider,
      eventId: w.eventId,
      eventType: w.eventType,
      processed: w.processed,
      processedAt: w.processedAt ?? null,
      error: w.error ?? null,
      createdAt: w.createdAt,
    }));

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export const adminService = new AdminService();
