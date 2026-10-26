import { env } from '../../config/env.js';
import { ServiceUnavailableError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { AiAssistanceProvider } from './ai.interface.js';
import { mockAiProvider } from './mock-ai.provider.js';
import { GeminiAiAssistanceProvider } from './gemini-ai.provider.js';
import { OpenAiAssistanceProvider } from './openai-ai.provider.js';

export * from './ai.interface.js';
export { mockAiProvider } from './mock-ai.provider.js';
export { GeminiAiAssistanceProvider } from './gemini-ai.provider.js';
export { OpenAiAssistanceProvider } from './openai-ai.provider.js';

/**
 * Returns the configured AI provider based on environment variables.
 * If AI is disabled or credentials are not configured, throws ServiceUnavailableError.
 * In production, mock provider is strictly forbidden.
 */
export function getAiAssistanceProvider(): AiAssistanceProvider {
  const providerType = env.AI_PROVIDER;

  if (providerType === 'mock') {
    if (env.NODE_ENV === 'production') {
      throw new ServiceUnavailableError(
        'Mock AI provider cannot be selected in production.',
        ErrorCode.AI_PROVIDER_UNAVAILABLE,
      );
    }
    return mockAiProvider;
  }

  if (providerType === 'gemini') {
    if (!env.AI_API_KEY || env.AI_API_KEY.trim().length === 0) {
      throw new ServiceUnavailableError(
        'AI feedback assistance is currently unconfigured.',
        ErrorCode.AI_PROVIDER_UNAVAILABLE,
      );
    }
    return new GeminiAiAssistanceProvider(env.AI_API_KEY, env.AI_TIMEOUT_MS);
  }

  if (providerType === 'openai') {
    if (!env.AI_API_KEY || env.AI_API_KEY.trim().length === 0) {
      throw new ServiceUnavailableError(
        'AI feedback assistance is currently unconfigured.',
        ErrorCode.AI_PROVIDER_UNAVAILABLE,
      );
    }
    return new OpenAiAssistanceProvider(env.AI_API_KEY, env.AI_TIMEOUT_MS);
  }

  // AI_PROVIDER === 'disabled' or unconfigured
  throw new ServiceUnavailableError(
    'AI feedback assistance is currently unavailable. Please write your review directly.',
    ErrorCode.AI_PROVIDER_UNAVAILABLE,
  );
}

/**
 * Server-side validation and sanitization of the AI provider's output.
 * Ensures the response is bounded, non-empty, and free of wrapping quote artifacts.
 */
export function sanitizeAiOutput(rawOutput: string): string {
  if (!rawOutput || typeof rawOutput !== 'string') {
    throw new ServiceUnavailableError(
      'AI feedback assistance produced an empty response.',
      ErrorCode.AI_PROVIDER_UNAVAILABLE,
    );
  }

  let sanitized = rawOutput.trim();

  // Strip wrapping markdown code blocks if the model generated any
  if (sanitized.startsWith('```') && sanitized.endsWith('```')) {
    sanitized = sanitized
      .replace(/^```[a-z]*\n?/i, '')
      .replace(/\n?```$/, '')
      .trim();
  }

  // Strip wrapping double quotes if model wrapped text in quotes
  if (sanitized.startsWith('"') && sanitized.endsWith('"') && sanitized.length > 2) {
    sanitized = sanitized.slice(1, -1).trim();
  }

  // Bound checks: minimum 5 chars, maximum 2500 chars
  if (sanitized.length < 5) {
    throw new ServiceUnavailableError(
      'AI feedback assistance produced an insufficient response.',
      ErrorCode.AI_PROVIDER_UNAVAILABLE,
    );
  }

  if (sanitized.length > 2500) {
    throw new ServiceUnavailableError(
      'AI feedback assistance produced an excessively long response.',
      ErrorCode.AI_PROVIDER_UNAVAILABLE,
    );
  }

  return sanitized;
}
