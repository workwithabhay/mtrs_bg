import { describe, it, expect } from 'vitest';
import {
  generateNumericOtp,
  hashOtp,
  verifyOtpHash,
  generateSessionToken,
  hashSessionToken,
  generateCsrfToken,
} from '../../../src/common/utils/crypto.js';

describe('Cryptographic Utilities Unit Tests', () => {
  it('generateNumericOtp should generate a 6-digit numeric string', () => {
    const otp = generateNumericOtp();
    expect(otp).toHaveLength(6);
    expect(/^\d{6}$/.test(otp)).toBe(true);
  });

  it('hashOtp should produce consistent keyed HMAC hash for same input', () => {
    const email = 'user@example.com';
    const purpose = 'signup';
    const otp = '123456';

    const hash1 = hashOtp(email, purpose, otp);
    const hash2 = hashOtp(email, purpose, otp);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex string
  });

  it('hashOtp should produce different hashes for different purposes or emails', () => {
    const email = 'user@example.com';
    const otp = '123456';

    const signupHash = hashOtp(email, 'signup', otp);
    const loginHash = hashOtp(email, 'login', otp);
    const otherEmailHash = hashOtp('other@example.com', 'signup', otp);

    expect(signupHash).not.toBe(loginHash);
    expect(signupHash).not.toBe(otherEmailHash);
  });

  it('verifyOtpHash should return true for matching candidate and false for incorrect candidate', () => {
    const email = 'test@example.com';
    const purpose = 'login';
    const realOtp = '654321';
    const expectedHash = hashOtp(email, purpose, realOtp);

    expect(verifyOtpHash(email, purpose, realOtp, expectedHash)).toBe(true);
    expect(verifyOtpHash(email, purpose, '000000', expectedHash)).toBe(false);
    expect(verifyOtpHash(email, 'signup', realOtp, expectedHash)).toBe(false);
  });

  it('generateSessionToken should generate high-entropy 64-character token', () => {
    const token1 = generateSessionToken();
    const token2 = generateSessionToken();

    expect(token1).toHaveLength(64);
    expect(token2).toHaveLength(64);
    expect(token1).not.toBe(token2);
  });

  it('hashSessionToken should produce consistent HMAC hash', () => {
    const rawToken = generateSessionToken();
    const hash1 = hashSessionToken(rawToken);
    const hash2 = hashSessionToken(rawToken);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('generateCsrfToken should generate random 48-character token', () => {
    const csrf = generateCsrfToken();
    expect(csrf).toHaveLength(48);
  });
});
