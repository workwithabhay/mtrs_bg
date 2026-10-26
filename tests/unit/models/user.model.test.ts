import { describe, it, expect } from 'vitest';
import { User } from '../../../src/modules/users/user.model.js';

describe('User Model Schema Validation Tests', () => {
  it('should validate a valid user successfully', async () => {
    const validUser = new User({
      name: 'Jane Doe',
      email: 'Jane.Doe@example.com',
      role: 'business_owner',
    });

    await expect(validUser.validate()).resolves.toBeUndefined();
    // Verify lowercase email normalization
    expect(validUser.email).toBe('jane.doe@example.com');
    // Verify defaults
    expect(validUser.status).toBe('pending');
    expect(validUser.isEmailVerified).toBe(false);
    expect(validUser.role).toBe('business_owner');
  });

  it('should fail validation when name is missing', async () => {
    const invalidUser = new User({
      email: 'user@example.com',
    });

    await expect(invalidUser.validate()).rejects.toThrow('User name is required');
  });

  it('should fail validation when email format is invalid', async () => {
    const invalidUser = new User({
      name: 'John Doe',
      email: 'not-an-email-format',
    });

    await expect(invalidUser.validate()).rejects.toThrow('Please provide a valid email address');
  });

  it('should fail validation when role is unsupported', async () => {
    const invalidUser = new User({
      name: 'Hacker',
      email: 'hacker@example.com',
      role: 'super_hacker_admin' as unknown,
    });

    await expect(invalidUser.validate()).rejects.toThrow(
      "Role 'super_hacker_admin' is not supported",
    );
  });
});
