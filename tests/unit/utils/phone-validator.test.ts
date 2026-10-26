import { describe, it, expect } from 'vitest';
import { normalizePhoneNumber } from '../../../src/common/utils/phone-validator.js';
import { ValidationError } from '../../../src/common/errors/app-error.js';

describe('Phone Number Normalization Unit Tests', () => {
  it('should normalize standard US/international formats', () => {
    expect(normalizePhoneNumber('+1 (555) 234-5678')).toBe('+15552345678');
    expect(normalizePhoneNumber('555-234-5678')).toBe('5552345678');
    expect(normalizePhoneNumber('+91 98765 43210')).toBe('+919876543210');
    expect(normalizePhoneNumber('(020) 7946 0912')).toBe('02079460912');
  });

  it('should preserve plain digits within length bounds (7-15 digits)', () => {
    expect(normalizePhoneNumber('1234567')).toBe('1234567');
    expect(normalizePhoneNumber('123456789012345')).toBe('123456789012345');
  });

  it('should reject numbers that are too short (< 7 digits)', () => {
    expect(() => normalizePhoneNumber('12345')).toThrow(ValidationError);
  });

  it('should reject numbers that are too long (> 15 digits)', () => {
    expect(() => normalizePhoneNumber('123456789012345678')).toThrow(ValidationError);
  });

  it('should reject non-numeric characters', () => {
    expect(() => normalizePhoneNumber('abc-def-ghij')).toThrow(ValidationError);
    expect(() => normalizePhoneNumber('555-CALL-NOW')).toThrow(ValidationError);
  });

  it('should reject empty or whitespace-only inputs', () => {
    expect(() => normalizePhoneNumber('')).toThrow(ValidationError);
    expect(() => normalizePhoneNumber('   ')).toThrow(ValidationError);
  });
});
