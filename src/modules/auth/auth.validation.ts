import { z } from 'zod';

const EMAIL_SCHEMA = z
  .string()
  .min(1, 'Email is required')
  .trim()
  .toLowerCase()
  .email('Please provide a valid email address');

const OTP_CODE_SCHEMA = z
  .string()
  .min(1, 'OTP is required')
  .trim()
  .length(6, 'OTP must be exactly 6 digits')
  .regex(/^\d{6}$/, 'OTP must contain only numbers');

export const signupRequestOtpSchema = z.object({
  email: EMAIL_SCHEMA,
  name: z
    .string()
    .min(1, 'Full name is required')
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters'),
  businessName: z
    .string()
    .min(1, 'Business name is required')
    .trim()
    .min(2, 'Business name must be at least 2 characters')
    .max(120, 'Business name cannot exceed 120 characters'),
  category: z
    .string()
    .min(1, 'Business category is required')
    .trim()
    .min(2, 'Category must be at least 2 characters')
    .max(80, 'Category cannot exceed 80 characters'),
  googleReviewUrl: z
    .string()
    .trim()
    .url('Google review URL must be a valid URL')
    .optional()
    .or(z.literal('')),
  consentAccepted: z
    .boolean({
      message: 'You must accept the terms of service and policy to register',
    })
    .refine((val) => val === true, {
      message: 'You must accept the terms of service and policy to register',
    }),
});

export const signupVerifyOtpSchema = z.object({
  email: EMAIL_SCHEMA,
  otp: OTP_CODE_SCHEMA,
});

export const loginRequestOtpSchema = z.object({
  email: EMAIL_SCHEMA,
});

export const loginVerifyOtpSchema = z.object({
  email: EMAIL_SCHEMA,
  otp: OTP_CODE_SCHEMA,
});

export type SignupRequestOtpInput = z.infer<typeof signupRequestOtpSchema>;
export type SignupVerifyOtpInput = z.infer<typeof signupVerifyOtpSchema>;
export type LoginRequestOtpInput = z.infer<typeof loginRequestOtpSchema>;
export type LoginVerifyOtpInput = z.infer<typeof loginVerifyOtpSchema>;
