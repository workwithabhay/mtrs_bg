import type { IUserDocument } from '../modules/users/user.types.js';
import type { ISessionDocument } from '../modules/auth/models/session.model.js';
import type { EntitlementInfo } from '../modules/billing/billing.types.js';
import type { Types } from 'mongoose';

// Express Request interface augmentation for application-wide properties
declare global {
  namespace Express {
    interface Request {
      id: string;
      user?: IUserDocument;
      session?: ISessionDocument;
      businessId?: Types.ObjectId;
      rawBody?: Buffer;
      entitlement?: EntitlementInfo;
    }
  }
}

export {};
