import { ValidationError } from '../errors/app-error.js';

/**
 * Normalizes customer phone numbers into clean standard format.
 * Strips whitespace, hyphens, parentheses, and dots.
 * Validates digit length (between 7 and 15 digits, optionally prefixed with '+').
 */
export function normalizePhoneNumber(rawPhone: string): string {
  if (!rawPhone || typeof rawPhone !== 'string') {
    throw new ValidationError('Phone number must be a valid string.');
  }

  const trimmed = rawPhone.trim();
  // Strip whitespace, hyphens, parentheses, dots
  const stripped = trimmed.replace(/[\s\-().]/g, '');

  // Must contain only digits, optionally prefixed with a '+'
  if (!/^\+?[0-9]{7,15}$/.test(stripped)) {
    throw new ValidationError(
      'Invalid phone number format. Must contain 7 to 15 digits (e.g. +1234567890 or 9876543210).',
    );
  }

  return stripped;
}
