import type { Types, Document } from 'mongoose';

export type BusinessStatus = 'active' | 'suspended' | 'pending_verification';

export interface IBusinessBranding {
  logoUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
}

export type FeedbackQuestionType = 'text' | 'long_text' | 'single_choice';

export interface IFeedbackQuestion {
  id: string;
  label: string;
  type: FeedbackQuestionType;
  required: boolean;
  options?: string[];
}

export interface IBusinessSettings {
  allowPublicReviews: boolean;
  notificationEmail?: string | null;
  defaultLanguage: 'en';
  headingText?: string | null;
  subheadingText?: string | null;
  feedbackQuestions?: IFeedbackQuestion[];
}

export interface IBusiness {
  name: string;
  category: string;
  ownerId: Types.ObjectId;
  googleReviewUrl?: string | null;
  googlePlaceId?: string | null;
  status: BusinessStatus;
  branding: IBusinessBranding;
  settings: IBusinessSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface IBusinessDocument extends IBusiness, Document<Types.ObjectId> {}
