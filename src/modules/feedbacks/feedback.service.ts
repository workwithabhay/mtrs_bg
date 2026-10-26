import mongoose, { type Types } from 'mongoose';
import { Customer, type ICustomerDocument } from './models/customer.model.js';
import { Feedback, type IFeedbackDocument, type FeedbackStatus } from './models/feedback.model.js';
import { Business } from '../businesses/business.model.js';
import { DEFAULT_FEEDBACK_QUESTIONS } from '../businesses/business.model.js';
import { QrCampaign } from '../qr-campaigns/models/qr-campaign.model.js';
import { QrEvent } from '../qr-campaigns/models/qr-event.model.js';
import { normalizePhoneNumber } from '../../common/utils/phone-validator.js';
import {
  NotFoundError,
  ValidationError,
  ServiceUnavailableError,
} from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { logger } from '../../common/utils/logger.js';
import {
  getAiAssistanceProvider,
  sanitizeAiOutput,
  type FeedbackQuestionAnswer,
} from '../../integrations/ai/index.js';
import type {
  SubmitFeedbackInput,
  ListFeedbackQuery,
  ListCustomersQuery,
  AiAssistanceInput,
  OwnerAiAssistanceInput,
} from './feedback.validation.js';

export class FeedbackService {
  /**
   * Resolves the public landing page data for a customer scanning a QR code.
   * Never leaks internal MongoDB IDs, owner details, or private configuration.
   */
  async getPublicLandingByToken(publicToken: string) {
    if (!publicToken || typeof publicToken !== 'string') {
      throw new NotFoundError('Invalid public campaign token format.');
    }

    const campaign = await QrCampaign.findOne({ publicToken, status: 'active' });
    if (!campaign) {
      throw new NotFoundError('QR campaign not found or is currently inactive.');
    }

    const business = await Business.findOne({
      _id: campaign.businessId,
      status: 'active',
    });

    if (!business) {
      throw new NotFoundError('Associated business is not available.');
    }

    const questions =
      business.settings?.feedbackQuestions && business.settings.feedbackQuestions.length > 0
        ? business.settings.feedbackQuestions
        : DEFAULT_FEEDBACK_QUESTIONS;

    return {
      campaign: {
        title: campaign.title,
        heading: campaign.heading,
        description: campaign.description,
        branding: {
          primaryColor: campaign.branding.primaryColor,
          backgroundColor: campaign.branding.backgroundColor,
          logoUrl: campaign.branding.logoUrl,
        },
      },
      business: {
        name: business.name,
      },
      // Review policy compliant: Google review option is provided without gating
      googleReviewUrl: business.googleReviewUrl || null,
      feedbackQuestions: questions,
    };
  }

  /**
   * Submits customer rating and feedback without review gating.
   */
  async submitFeedback(
    publicToken: string,
    input: SubmitFeedbackInput,
  ): Promise<{
    message: string;
    feedbackId: string;
    googleReviewUrl: string | null;
  }> {
    const campaign = await QrCampaign.findOne({ publicToken, status: 'active' });
    if (!campaign) {
      throw new NotFoundError('QR campaign not found or is currently inactive.');
    }

    const business = await Business.findOne({
      _id: campaign.businessId,
      status: 'active',
    });

    if (!business) {
      throw new NotFoundError('Associated business is not available.');
    }

    // 1. Normalize contact details
    let normalizedEmail: string | null = null;
    let normalizedPhone: string | null = null;

    if (input.customerEmail && input.customerEmail.trim().length > 0) {
      normalizedEmail = input.customerEmail.trim().toLowerCase();
    }

    if (input.customerPhone && input.customerPhone.trim().length > 0) {
      normalizedPhone = normalizePhoneNumber(input.customerPhone);
    }

    if (!normalizedEmail && !normalizedPhone) {
      throw new ValidationError(
        'Please provide at least one contact method: email address or phone number.',
      );
    }

    // 2. Validate custom questions against active business configuration
    const activeQuestions =
      business.settings?.feedbackQuestions && business.settings.feedbackQuestions.length > 0
        ? business.settings.feedbackQuestions
        : DEFAULT_FEEDBACK_QUESTIONS;

    const submittedAnswers = input.answers || [];
    const formattedAnswers: { questionId: string; questionLabel: string; answer: string }[] = [];

    // Verify all submitted answers belong to recognized questions
    for (const ans of submittedAnswers) {
      const questionDef = activeQuestions.find((q) => q.id === ans.questionId);
      if (!questionDef) {
        throw new ValidationError(`Question ID '${ans.questionId}' is not recognized.`);
      }

      // Check single_choice options
      if (questionDef.type === 'single_choice' && questionDef.options) {
        if (!questionDef.options.includes(ans.answer)) {
          throw new ValidationError(
            `Invalid option '${ans.answer}' selected for question '${questionDef.label}'. Permitted options: ${questionDef.options.join(', ')}`,
          );
        }
      }

      formattedAnswers.push({
        questionId: questionDef.id,
        questionLabel: questionDef.label,
        answer: ans.answer.trim(),
      });
    }

    // Check all required questions are answered
    for (const questionDef of activeQuestions) {
      if (questionDef.required) {
        const found = formattedAnswers.find((a) => a.questionId === questionDef.id);
        if (!found || found.answer.length === 0) {
          throw new ValidationError(
            `Answer for required question '${questionDef.label}' is missing.`,
          );
        }
      }
    }

    // 3. Resolve or create Customer record for this tenant
    let customer: ICustomerDocument | null = null;

    if (normalizedEmail) {
      customer = await Customer.findOne({
        businessId: business._id,
        email: normalizedEmail,
      });
    }

    if (!customer && normalizedPhone) {
      customer = await Customer.findOne({
        businessId: business._id,
        phone: normalizedPhone,
      });
    }

    if (customer) {
      // Update contact details and repeat visit timestamp
      customer.name = input.customerName.trim();
      if (normalizedEmail) customer.email = normalizedEmail;
      if (normalizedPhone) customer.phone = normalizedPhone;
      customer.lastVisitedAt = new Date();
      await customer.save();
    } else {
      customer = new Customer({
        businessId: business._id,
        name: input.customerName.trim(),
        email: normalizedEmail,
        phone: normalizedPhone,
        lastVisitedAt: new Date(),
      });
      await customer.save();
    }

    // 4. Duplicate submission defense (idempotency within 60-second window)
    const recentCutoff = new Date(Date.now() - 60 * 1000);
    const existingRecentFeedback = await Feedback.findOne({
      businessId: business._id,
      qrCampaignId: campaign._id,
      customerId: customer._id,
      rating: input.rating,
      createdAt: { $gte: recentCutoff },
    });

    if (existingRecentFeedback) {
      logger.info(
        { customerId: customer._id, campaignId: campaign._id },
        'Duplicate feedback submission detected within 60s; returning idempotent confirmation',
      );
      return {
        message: 'Thank you for your feedback! Your response has been received.',
        feedbackId: existingRecentFeedback._id.toString(),
        googleReviewUrl: business.googleReviewUrl || null,
      };
    }

    // 5. Create Feedback record
    const feedback = new Feedback({
      businessId: business._id,
      qrCampaignId: campaign._id,
      customerId: customer._id,
      rating: input.rating,
      text: input.text ? input.text.trim() : null,
      answers: formattedAnswers,
      status: 'new',
      consentAccepted: true,
    });

    await feedback.save();

    // Compliant with Review Policy: Google review option is provided regardless of rating
    return {
      message: 'Thank you for your feedback! Your response has been received.',
      feedbackId: feedback._id.toString(),
      googleReviewUrl: business.googleReviewUrl || null,
    };
  }

  /**
   * Records a Google review click event from customer landing and returns destination URL.
   * Available for all ratings without gating; strictly prevents open redirects.
   */
  async trackGoogleReviewClick(
    publicToken: string,
    meta: { referrer?: string; language?: string },
  ): Promise<{ destinationUrl: string }> {
    const campaign = await QrCampaign.findOne({ publicToken, status: 'active' });
    if (!campaign) {
      throw new NotFoundError('QR campaign not found or is currently inactive.');
    }

    const business = await Business.findOne({
      _id: campaign.businessId,
      status: 'active',
    });

    if (!business) {
      throw new NotFoundError('Associated business is not available.');
    }

    if (!business.googleReviewUrl) {
      throw new ValidationError(
        'Google review URL is not configured or enabled for this business.',
      );
    }

    // Record click event telemetry in background
    QrEvent.create({
      campaignId: campaign._id,
      businessId: business._id,
      eventType: 'google_review_click',
      metadata: {
        referrer: meta.referrer ? meta.referrer.slice(0, 200) : undefined,
        language: meta.language ? meta.language.slice(0, 10) : undefined,
        destinationUrl: business.googleReviewUrl,
      },
    }).catch((err: Error) => {
      logger.error({ err }, 'Failed to record google review click event in background');
    });

    return {
      destinationUrl: business.googleReviewUrl,
    };
  }

  /**
   * Lists feedback submissions for the authenticated business tenant.
   */
  async listFeedbacks(
    businessId: Types.ObjectId,
    query: ListFeedbackQuery,
  ): Promise<{
    feedbacks: IFeedbackDocument[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const filter: Record<string, unknown> = { businessId };

    if (query.rating !== undefined) {
      filter.rating = query.rating;
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.startDate || query.endDate) {
      const dateFilter: Record<string, Date> = {};
      if (query.startDate) {
        dateFilter.$gte = new Date(query.startDate);
      }
      if (query.endDate) {
        dateFilter.$lte = new Date(query.endDate);
      }
      filter.createdAt = dateFilter;
    }

    const skip = (query.page - 1) * query.limit;
    const sortField = query.sortBy === 'rating' ? 'rating' : 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

    const [feedbacks, total] = await Promise.all([
      Feedback.find(filter)
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(query.limit)
        .populate('customerId', 'name email phone lastVisitedAt')
        .populate('qrCampaignId', 'title publicToken'),
      Feedback.countDocuments(filter),
    ]);

    return {
      feedbacks,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  /**
   * Retrieves single feedback by ID scoped to authenticated tenant.
   */
  async getFeedbackById(
    businessId: Types.ObjectId,
    feedbackId: string,
  ): Promise<IFeedbackDocument> {
    if (!mongoose.Types.ObjectId.isValid(feedbackId)) {
      throw new ValidationError(`Invalid feedback ID format '${feedbackId}'.`);
    }

    const feedback = await Feedback.findOne({
      _id: feedbackId,
      businessId,
    })
      .populate('customerId', 'name email phone lastVisitedAt')
      .populate('qrCampaignId', 'title publicToken');

    if (!feedback) {
      throw new NotFoundError('Feedback not found or access unauthorized.');
    }

    return feedback;
  }

  /**
   * Updates feedback internal review lifecycle status ('new' -> 'reviewed' -> 'resolved').
   * Prevents changing rating, text, customer, campaign, or ownership.
   */
  async updateFeedbackStatus(
    businessId: Types.ObjectId,
    feedbackId: string,
    status: FeedbackStatus,
  ): Promise<IFeedbackDocument> {
    const feedback = await this.getFeedbackById(businessId, feedbackId);
    feedback.status = status;
    await feedback.save();
    return feedback;
  }

  /**
   * Generates AI assistance for customer-drafted feedback.
   * Resolves the active public QR campaign and associated business.
   * Sanitizes and maps any question answers into context.
   * Never forwards customer contact details or PII.
   * Does NOT write to the database or submit a review.
   */
  async generateAiAssistance(
    publicToken: string,
    input: AiAssistanceInput,
  ): Promise<{
    originalDraft: string;
    suggestedText: string;
    mode: string;
  }> {
    if (!publicToken || typeof publicToken !== 'string') {
      throw new NotFoundError('Invalid public campaign token format.');
    }

    const campaign = await QrCampaign.findOne({ publicToken, status: 'active' });
    if (!campaign) {
      throw new NotFoundError('QR campaign not found or is currently inactive.');
    }

    const business = await Business.findOne({
      _id: campaign.businessId,
      status: 'active',
    });

    if (!business) {
      throw new NotFoundError('Associated business is not available.');
    }

    // Map any provided answers against configured feedback questions
    const activeQuestions =
      business.settings?.feedbackQuestions && business.settings.feedbackQuestions.length > 0
        ? business.settings.feedbackQuestions
        : DEFAULT_FEEDBACK_QUESTIONS;

    const mappedAnswers: FeedbackQuestionAnswer[] = [];
    if (input.answers && input.answers.length > 0) {
      for (const ans of input.answers) {
        const questionDef = activeQuestions.find((q) => q.id === ans.questionId);
        if (questionDef && ans.answer.trim().length > 0) {
          mappedAnswers.push({
            questionLabel: questionDef.label,
            answer: ans.answer.trim(),
          });
        }
      }
    }

    // Retrieve provider (throws ServiceUnavailableError if disabled or unconfigured)
    const provider = getAiAssistanceProvider();

    try {
      // Generate suggested wording
      const rawResult = await provider.generateAssistance({
        draftText: input.draftText,
        answers: mappedAnswers,
        mode: input.mode,
      });

      // Validate and sanitize AI output
      const sanitizedOutput = sanitizeAiOutput(rawResult);

      return {
        originalDraft: input.draftText,
        suggestedText: sanitizedOutput,
        mode: input.mode,
      };
    } catch (err: unknown) {
      if (err instanceof ServiceUnavailableError) {
        throw err;
      }

      logger.warn({ err }, 'AI assistance provider failed or timed out');
      throw new ServiceUnavailableError(
        'AI feedback assistance is currently unavailable. Please write your review directly.',
        ErrorCode.AI_PROVIDER_UNAVAILABLE,
      );
    }
  }

  /**
   * Generates improved wording for owner-authorized feedback text in AI Feedback Studio.
   * Strictly preserves factual claims, author's sentiment, and concrete details.
   * Does NOT write to the database or modify any record.
   */
  async generateOwnerAiAssistance(
    businessId: Types.ObjectId,
    input: OwnerAiAssistanceInput,
  ): Promise<{
    originalDraft: string;
    suggestedText: string;
    mode: string;
  }> {
    const business = await Business.findOne({
      _id: businessId,
      status: 'active',
    });

    if (!business) {
      throw new NotFoundError('Associated business is not available.');
    }

    const provider = getAiAssistanceProvider();

    try {
      const rawResult = await provider.generateAssistance({
        draftText: input.draftText,
        mode: input.action,
      });

      const sanitizedOutput = sanitizeAiOutput(rawResult);

      return {
        originalDraft: input.draftText,
        suggestedText: sanitizedOutput,
        mode: input.action,
      };
    } catch (err: unknown) {
      if (err instanceof ServiceUnavailableError) {
        throw err;
      }

      logger.warn({ err }, 'AI assistance provider failed or timed out for owner studio');
      throw new ServiceUnavailableError(
        'AI feedback assistance is currently unavailable. Please edit your text directly.',
        ErrorCode.AI_PROVIDER_UNAVAILABLE,
      );
    }
  }

  /**
   * Lists customer directory records for the authenticated business tenant,
   * enriched with verified feedback submission counts and average ratings.
   */
  async listCustomers(
    businessId: Types.ObjectId,
    query: ListCustomersQuery,
  ): Promise<{
    customers: Array<{
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      lastVisitedAt: Date;
      createdAt: Date;
      feedbackCount: number;
      avgRating: number | null;
      latestRating: number | null;
      isRepeat: boolean;
    }>;
    stats: {
      totalCustomers: number;
      repeatCustomers: number;
      averageRating: number | null;
    };
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const filter: Record<string, unknown> = { businessId };

    if (query.search && query.search.trim().length > 0) {
      const escaped = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
        { phone: { $regex: escaped, $options: 'i' } },
      ];
    }

    const skip = (query.page - 1) * query.limit;
    const sortField = query.sortBy;
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

    const [customerDocs, totalCount, allTenantStats] = await Promise.all([
      Customer.find(filter)
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(query.limit),
      Customer.countDocuments(filter),
      Promise.all([
        Customer.countDocuments({ businessId }),
        Feedback.aggregate([
          { $match: { businessId: new mongoose.Types.ObjectId(businessId) } },
          {
            $group: {
              _id: '$customerId',
              count: { $sum: 1 },
              avgRating: { $avg: '$rating' },
            },
          },
        ]),
        Feedback.aggregate([
          { $match: { businessId: new mongoose.Types.ObjectId(businessId) } },
          {
            $group: {
              _id: null,
              overallAvg: { $avg: '$rating' },
            },
          },
        ]),
      ]),
    ]);

    const totalCustomers = allTenantStats[0];
    const customerFeedbackGroups = allTenantStats[1];
    const overallRatingGroup = allTenantStats[2];

    const repeatCustomers = customerFeedbackGroups.filter((g) => g.count > 1).length;
    const averageRating =
      overallRatingGroup.length > 0 && overallRatingGroup[0].overallAvg != null
        ? Number(overallRatingGroup[0].overallAvg.toFixed(1))
        : null;

    const feedbackMap = new Map<
      string,
      { count: number; avgRating: number; latestRating: number | null }
    >();

    if (customerDocs.length > 0) {
      const pageCustomerIds = customerDocs.map((c) => c._id);
      const pageStats = await Feedback.aggregate([
        {
          $match: {
            businessId: new mongoose.Types.ObjectId(businessId),
            customerId: { $in: pageCustomerIds },
          },
        },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: '$customerId',
            count: { $sum: 1 },
            avgRating: { $avg: '$rating' },
            latestRating: { $first: '$rating' },
          },
        },
      ]);

      for (const stat of pageStats) {
        feedbackMap.set(stat._id.toString(), {
          count: stat.count,
          avgRating: stat.avgRating,
          latestRating: stat.latestRating ?? null,
        });
      }
    }

    const customers = customerDocs.map((doc) => {
      const stats = feedbackMap.get(doc._id.toString());
      const feedbackCount = stats?.count ?? 0;
      const avgRating = stats?.avgRating ? Number(stats.avgRating.toFixed(1)) : null;

      return {
        id: doc._id.toString(),
        name: doc.name,
        email: doc.email ?? null,
        phone: doc.phone ?? null,
        lastVisitedAt: doc.lastVisitedAt,
        createdAt: doc.createdAt,
        feedbackCount,
        avgRating,
        latestRating: stats?.latestRating ?? null,
        isRepeat: feedbackCount > 1,
      };
    });

    return {
      customers,
      stats: {
        totalCustomers,
        repeatCustomers,
        averageRating,
      },
      total: totalCount,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(totalCount / query.limit) || 1,
    };
  }
}

export const feedbackService = new FeedbackService();

