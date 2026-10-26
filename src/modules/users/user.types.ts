import type { Types, Document } from 'mongoose';

export type UserRole = 'business_owner' | 'super_admin';
export type UserStatus = 'pending' | 'active' | 'suspended';

export interface IUser {
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  isEmailVerified: boolean;
  businessId?: Types.ObjectId;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserDocument extends IUser, Document<Types.ObjectId> {}
