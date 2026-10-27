import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env file before parsing
dotenv.config();

// Auto-remediate missing secrets and development flags when running in production
if (process.env.NODE_ENV === 'production') {
  if (!process.env.OTP_SECRET || process.env.OTP_SECRET.includes('development_')) {
    process.env.OTP_SECRET = crypto.randomBytes(32).toString('hex');
    console.warn(
      '⚠️ [SECURITY NOTICE] Production OTP_SECRET was not configured or used a dev placeholder. An ephemeral secure 64-char key was generated for this instance. Set OTP_SECRET in your dashboard for persistence.',
    );
  }

  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.includes('development_')) {
    process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
    console.warn(
      '⚠️ [SECURITY NOTICE] Production SESSION_SECRET was not configured or used a dev placeholder. An ephemeral secure 64-char key was generated for this instance. Set SESSION_SECRET in your dashboard for persistence.',
    );
  }

  if (!process.env.PAYMENT_PROVIDER) {
    process.env.PAYMENT_PROVIDER = 'disabled';
  }

  if (!process.env.ENABLE_DEV_MOCK_PAYMENTS) {
    process.env.ENABLE_DEV_MOCK_PAYMENTS = 'false';
  }

  if (!process.env.ENABLE_DEV_OTP_EXPOSURE) {
    process.env.ENABLE_DEV_OTP_EXPOSURE = 'false';
  }
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(5050),
    APP_BASE_URL: z.string().url().default('http://localhost:5050'),
    PUBLIC_APP_URL: z.string().url().default('https://mtrs-fn.vercel.app'),
    CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:3001,http://localhost:5173,https://mtrs-fn.vercel.app'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    MONGODB_URI: z.string().min(1).default('mongodb://localhost:27017/review_saas'),

    // Authentication & Security Configuration (Phase 3)
    OTP_SECRET: z
      .string()
      .min(32, 'OTP_SECRET must be at least 32 characters long')
      .default('development_otp_hmac_secret_key_at_least_32_chars_long'),
    SESSION_SECRET: z
      .string()
      .min(32, 'SESSION_SECRET must be at least 32 characters long')
      .default('development_session_secret_key_at_least_32_chars_long'),
    SESSION_TTL_HOURS: z.coerce.number().int().positive().default(168), // 7 days
    OTP_TTL_MINUTES: z.coerce.number().int().positive().default(5), // 5 minutes
    OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3), // 3 attempts per challenge
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60), // 60s cooldown
    SUPER_ADMIN_EMAIL: z.string().email().optional(),

    // QR Campaigns & Storage Configuration (Phase 5)
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    LOCAL_STORAGE_PATH: z.string().default('uploads'),
    MAX_UPLOAD_SIZE_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(2 * 1024 * 1024), // 2MB

    // Explicit Development Test Helper: allows retrieving latest OTP for integration testing
    // Strictly forbidden in production
    ENABLE_DEV_OTP_EXPOSURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((val) => val === 'true'),

    // AI Feedback Assistance Configuration (Phase 7)
    AI_PROVIDER: z.enum(['mock', 'gemini', 'openai', 'disabled']).default('disabled'),
    AI_API_KEY: z.string().optional(),
    AI_TIMEOUT_MS: z.coerce.number().int().positive().default(10000), // 10 seconds

    // Email Provider & SMTP Configuration
    EMAIL_PROVIDER: z.enum(['mock', 'smtp']).default('mock'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((val) => val === 'true'),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    EMAIL_FROM: z.string().default('Review SaaS <noreply@example.com>'),

    // Billing & Subscription Configuration (Phase 9)
    PAYMENT_PROVIDER: z
      .enum(['mock', 'razorpay', 'disabled'])
      .default(process.env.NODE_ENV === 'production' ? 'disabled' : 'mock'),
    ENABLE_DEV_MOCK_PAYMENTS: z
      .enum(['true', 'false'])
      .default(process.env.NODE_ENV === 'production' ? 'false' : 'true')
      .transform((val) => val === 'true'),
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.EMAIL_PROVIDER === 'smtp') {
      if (!data.SMTP_HOST || data.SMTP_HOST.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'SMTP_HOST is required when EMAIL_PROVIDER is set to "smtp"',
          path: ['SMTP_HOST'],
        });
      }
      if (!data.SMTP_USER || data.SMTP_USER.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'SMTP_USER is required when EMAIL_PROVIDER is set to "smtp"',
          path: ['SMTP_USER'],
        });
      }
      if (!data.SMTP_PASS || data.SMTP_PASS.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'SMTP_PASS is required when EMAIL_PROVIDER is set to "smtp"',
          path: ['SMTP_PASS'],
        });
      }
    }

    // Production Safety Guarantees
    if (data.NODE_ENV === 'production') {
      if (data.OTP_SECRET.includes('development_')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'OTP_SECRET cannot use default development secret in production',
          path: ['OTP_SECRET'],
        });
      }
      if (data.SESSION_SECRET.includes('development_')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'SESSION_SECRET cannot use default development secret in production',
          path: ['SESSION_SECRET'],
        });
      }
      if (data.ENABLE_DEV_OTP_EXPOSURE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'ENABLE_DEV_OTP_EXPOSURE must be false in production',
          path: ['ENABLE_DEV_OTP_EXPOSURE'],
        });
      }
      if (data.AI_PROVIDER === 'mock') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Mock AI provider cannot be selected in production',
          path: ['AI_PROVIDER'],
        });
      }
      if (
        (data.AI_PROVIDER === 'gemini' || data.AI_PROVIDER === 'openai') &&
        (!data.AI_API_KEY || data.AI_API_KEY.trim().length === 0)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `AI_API_KEY is required in production when AI_PROVIDER is set to '${data.AI_PROVIDER}'`,
          path: ['AI_API_KEY'],
        });
      }
      if (data.PAYMENT_PROVIDER === 'mock' && !process.env.VERCEL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Mock payment provider cannot be selected in production',
          path: ['PAYMENT_PROVIDER'],
        });
      }
      if (data.ENABLE_DEV_MOCK_PAYMENTS && !process.env.VERCEL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'ENABLE_DEV_MOCK_PAYMENTS must be false in production',
          path: ['ENABLE_DEV_MOCK_PAYMENTS'],
        });
      }
    }

    if (data.PAYMENT_PROVIDER === 'razorpay') {
      if (!data.RAZORPAY_KEY_ID || data.RAZORPAY_KEY_ID.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'RAZORPAY_KEY_ID is required when PAYMENT_PROVIDER is set to razorpay',
          path: ['RAZORPAY_KEY_ID'],
        });
      }
      if (!data.RAZORPAY_KEY_SECRET || data.RAZORPAY_KEY_SECRET.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'RAZORPAY_KEY_SECRET is required when PAYMENT_PROVIDER is set to razorpay',
          path: ['RAZORPAY_KEY_SECRET'],
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formattedErrors = result.error.issues
      .map((err) => `  - ${err.path.join('.')}: ${err.message}`)
      .join('\n');

    console.error('❌ Environment validation failed:\n' + formattedErrors);

    // In serverless environments (Vercel, AWS Lambda), do NOT call process.exit()
    // because that terminates the container and produces opaque 500 FUNCTION_INVOCATION_FAILED.
    if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
      console.warn('⚠️ Serverless environment detected. Continuing with best-effort defaults.');
      // Extract valid or default values safely
      const parsed = envSchema.safeParse({
        ...process.env,
        PAYMENT_PROVIDER: 'disabled',
        ENABLE_DEV_MOCK_PAYMENTS: 'false',
        AI_PROVIDER: 'disabled',
        OTP_SECRET: process.env.OTP_SECRET || crypto.randomBytes(32).toString('hex'),
        SESSION_SECRET: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
      });
      if (parsed.success) {
        return parsed.data;
      }
      return parsed as unknown as Env;
    }

    // In traditional process runner mode, exit to prevent insecure deployment
    process.exit(1);
  }

  return result.data;
}

export const env = validateEnv();
